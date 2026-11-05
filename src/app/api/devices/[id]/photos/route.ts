import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { hasPermission } from "@/lib/access";
import { denied } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

const MAX_PHOTOS = 4;
const MAX_BYTES = 6 * 1024 * 1024;
const SLOTS = ["about-1", "about-2", "battery", "side"];

function canSeePhotos(role: string | undefined) {
  return role === "OWNER";
}

/** Super admin only. Arrival photos stay off the public site and off other staff accounts. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canSeePhotos(session.user.role)) return denied(session.user, "scope.allBranches", "Only a super admin can open arrival photos.");
  const { id } = await context.params;
  const photoId = new URL(request.url).searchParams.get("photo");
  if (photoId) {
    const photo = await prisma.devicePhoto.findFirst({ where: { id: photoId, deviceUnitId: id }, select: { mimeType: true, bytes: true } });
    if (!photo) return NextResponse.json({ error: "That photo was not found." }, { status: 404 });
    return new NextResponse(new Uint8Array(photo.bytes), { headers: { "Content-Type": photo.mimeType, "Cache-Control": "private, no-store" } });
  }
  const photos = await prisma.devicePhoto.findMany({ where: { deviceUnitId: id }, orderBy: { createdAt: "asc" }, select: { id: true, slot: true } });
  return NextResponse.json({ photos }, { headers: { "Cache-Control": "no-store" } });
}

/** Saved when stock is received. Viewing them is a separate, super-admin-only request. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(session.user, "inventory.receive") && !hasPermission(session.user, "sales.create")) {
    return denied(session.user, "inventory.receive", "Your permissions cannot save arrival photos.");
  }
  const { id } = await context.params;
  const unit = await prisma.deviceUnit.findUnique({ where: { id }, select: { id: true, branchId: true } });
  if (!unit) return NextResponse.json({ error: "That device was not found." }, { status: 404 });
  if (session.user.branchId && unit.branchId !== session.user.branchId && session.user.role !== "OWNER") {
    return NextResponse.json({ error: "That device is at another branch." }, { status: 403 });
  }
  const form = await request.formData().catch(() => null);
  const files = form?.getAll("photo").filter((value): value is File => value instanceof File).slice(0, MAX_PHOTOS) ?? [];
  if (!files.length) return NextResponse.json({ error: "Add the photos taken of this device." }, { status: 400 });
  const saved = [];
  for (const [index, file] of files.entries()) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) continue;
    if (file.size > MAX_BYTES) continue;
    const bytes = new Uint8Array(await file.arrayBuffer());
    saved.push(await prisma.devicePhoto.create({
      data: { deviceUnitId: id, slot: SLOTS[index] ?? "extra", mimeType: file.type || "image/jpeg", bytes: Buffer.from(bytes) },
      select: { id: true, slot: true },
    }));
  }
  if (!saved.length) return NextResponse.json({ error: "Those photos could not be saved." }, { status: 400 });
  return NextResponse.json({ photos: saved }, { status: 201 });
}
