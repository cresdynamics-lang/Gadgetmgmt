import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { hasPermission } from "@/lib/access";
import { denied } from "@/lib/authz";
import { devicePhotoReaderConfigured, readDevicePhoto } from "@/lib/device-photo";

export const maxDuration = 60;

const MAX_BYTES = 6 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Read IMEI, serial, model and the rest from a photo of a device's About screen, box or sticker. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  // Used when receiving stock and when taking a trade-in at the till.
  if (!hasPermission(session.user, "inventory.receive") && !hasPermission(session.user, "sales.create")) {
    return denied(session.user, "inventory.receive", "Your permissions cannot read device photos.");
  }
  if (!devicePhotoReaderConfigured()) return NextResponse.json({ error: "Photo reading needs the AI connection. Add the OpenRouter key to the server settings, or scan / type the details." }, { status: 503 });

  const form = await request.formData().catch(() => null);
  const photo = form?.get("photo");
  if (!(photo instanceof File) || !photo.size) return NextResponse.json({ error: "Take or choose a photo first." }, { status: 400 });
  if (!TYPES.includes(photo.type)) return NextResponse.json({ error: "Use a JPEG, PNG or WebP photo." }, { status: 400 });
  if (photo.size > MAX_BYTES) return NextResponse.json({ error: "That photo is too large. Try again closer to the screen." }, { status: 413 });

  try {
    const dataUrl = `data:${photo.type};base64,${Buffer.from(await photo.arrayBuffer()).toString("base64")}`;
    const result = await readDevicePhoto(dataUrl);
    const found = Object.values(result.fields).filter(Boolean).length;
    if (!found) return NextResponse.json({ error: "No device details could be read. Retake the photo straight on, with the About screen filling the frame." }, { status: 422 });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error("Device photo read failed", message.slice(0, 200));
    if (message === "PHOTO_UNREADABLE") return NextResponse.json({ error: "The photo could not be read. Retake it in good light, straight on." }, { status: 422 });
    return NextResponse.json({ error: "The photo could not be read right now. Try again, or scan / type the details." }, { status: 502 });
  }
}
