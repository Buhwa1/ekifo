// Development-only stand-in for Cloudinary so the listing wizard works without credentials.
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { currentUser } from "@/lib/auth";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from "@/lib/uploads";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic",
  "video/mp4": "mp4", "video/quicktime": "mov", "application/pdf": "pdf",
};

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_MOCK_PROVIDERS !== "1") return NextResponse.json({ error: "Disabled" }, { status: 404 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) return NextResponse.json({ error: "Unsupported file type" }, { status: 415 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "File too large (25 MB max)" }, { status: 413 });

  const buf = Buffer.from(await file.arrayBuffer());
  const checksum = createHash("md5").update(buf).digest("hex"); // same scheme as Cloudinary's etag
  const name = `${checksum}.${EXT[file.type]}`;
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), buf);
  const origin = new URL(req.url).origin;
  return NextResponse.json({
    secure_url: `${origin}/uploads/${name}`,
    public_id: name,
    etag: checksum,
    resource_type: file.type.startsWith("video") ? "video" : "image",
  });
}
