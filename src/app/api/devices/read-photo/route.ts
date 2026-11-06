import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { hasPermission } from "@/lib/access";
import { denied } from "@/lib/authz";
import { devicePhotoReaderConfigured, devicePhotoScanText, mergeDevicePhotoFields, readDevicePhoto } from "@/lib/device-photo";

export const maxDuration = 60;

const MAX_BYTES = 6 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

const MAX_PHOTOS = 4;

/** Read IMEI, serial, model and the rest from photos of a device's About screen, box or sticker. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  // Used when receiving stock and when taking a trade-in at the till.
  if (!hasPermission(session.user, "inventory.receive") && !hasPermission(session.user, "sales.create")) {
    return denied(session.user, "inventory.receive", "Your permissions cannot read device photos.");
  }
  if (!devicePhotoReaderConfigured()) return NextResponse.json({ error: "Photo reading needs the AI connection. Add the OpenRouter key to the server settings, or scan / type the details." }, { status: 503 });

  const form = await request.formData().catch(() => null);
  const photos = (form?.getAll("photo") ?? []).filter((item): item is File => item instanceof File && item.size > 0);
  if (!photos.length) return NextResponse.json({ error: "Take or choose a photo first." }, { status: 400 });
  if (photos.length > MAX_PHOTOS) return NextResponse.json({ error: `Upload up to ${MAX_PHOTOS} photos at a time.` }, { status: 400 });
  for (const photo of photos) {
    if (!TYPES.includes(photo.type)) return NextResponse.json({ error: "Use JPEG, PNG or WebP photos." }, { status: 400 });
    if (photo.size > MAX_BYTES) return NextResponse.json({ error: "One of those photos is too large. Try again closer to the screen." }, { status: 413 });
  }

  try {
    const reads = [];
    for (const photo of photos) {
      const dataUrl = `data:${photo.type};base64,${Buffer.from(await photo.arrayBuffer()).toString("base64")}`;
      try {
        reads.push(await readDevicePhoto(dataUrl));
      } catch (error) {
        if (photos.length === 1) throw error;
      }
    }
    const fields = mergeDevicePhotoFields(reads.map((read) => read.fields));
    const found = Object.values(fields).filter(Boolean).length;
    if (!found) return NextResponse.json({ error: "The photo was received, but no device details were in it. Fill the frame with the text and take it again." }, { status: 422 });
    return NextResponse.json({ fields, scanText: devicePhotoScanText(fields) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error("Device photo read failed", message.slice(0, 200));
    if (message === "PHOTO_UNREADABLE") return NextResponse.json({ error: "The photo was received, but the details could not be filled. Hold it steady with the text in frame and take it again." }, { status: 422 });
    return NextResponse.json({ error: "The photo could not be read right now. Try again, or scan / type the details." }, { status: 502 });
  }
}
