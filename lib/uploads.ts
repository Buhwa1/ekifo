import { createHash } from "node:crypto";
import { config } from "./config";

export type UploadFolder = "listings" | "kyc";

/**
 * Signed parameters for a browser-direct Cloudinary upload. The browser never sees the API secret,
 * and the signature pins the folder and timestamp so it can't be reused for something else.
 * KYC files get Cloudinary's random public_id, so their URLs are unguessable. For stricter privacy,
 * switch the kyc folder to type "authenticated" and serve admins signed delivery URLs.
 */
export function cloudinarySignature(folder: UploadFolder, userId: string) {
  const cfg = config();
  if (!cfg.cloudinaryEnabled) return null;
  const timestamp = Math.floor(Date.now() / 1000);
  const params: Record<string, string | number> = {
    folder: `findekifo/${folder}/${userId}`,
    timestamp,
  };
  const toSign = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  const signature = createHash("sha1").update(toSign + cfg.CLOUDINARY_API_SECRET).digest("hex");
  return {
    mode: "cloudinary" as const,
    url: `https://api.cloudinary.com/v1_1/${cfg.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/auto/upload`,
    fields: { ...params, api_key: cfg.CLOUDINARY_API_KEY!, signature },
  };
}

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ALLOWED_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "video/mp4", "video/quicktime", "application/pdf"];
