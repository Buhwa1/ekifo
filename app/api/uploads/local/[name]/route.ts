// Serves files written by the local upload stand-in. `next start` only serves files that were in
// /public at build time, so anything uploaded afterwards is streamed from here (via a rewrite).
import { readFile } from "node:fs/promises";
import path from "node:path";

const TYPES: Record<string, string> = {
  jpg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic",
  mp4: "video/mp4", mov: "video/quicktime", pdf: "application/pdf",
};

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const m = /^([a-f0-9]{32})\.([a-z0-9]{2,4})$/.exec(name);
  if (!m || !TYPES[m[2]]) return new Response("Not found", { status: 404 });
  try {
    const buf = await readFile(path.join(process.cwd(), "public", "uploads", name));
    return new Response(new Uint8Array(buf), {
      headers: { "Content-Type": TYPES[m[2]], "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
