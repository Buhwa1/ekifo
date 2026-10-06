import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { cloudinarySignature, type UploadFolder } from "@/lib/uploads";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { folder } = (await req.json().catch(() => ({}))) as { folder?: UploadFolder };
  if (folder !== "listings" && folder !== "kyc") return NextResponse.json({ error: "Bad folder" }, { status: 400 });

  const signed = cloudinarySignature(folder, user.id);
  if (signed) return NextResponse.json(signed);
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_MOCK_PROVIDERS !== "1")
    return NextResponse.json({ error: "Uploads are not configured" }, { status: 503 });
  return NextResponse.json({ mode: "local", url: "/api/uploads/local", fields: { folder } });
}
