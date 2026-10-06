import { createHmac, randomBytes, randomInt, timingSafeEqual, createHash } from "node:crypto";
import { config } from "./config";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Keyed hash for low-entropy secrets (OTP codes, NINs) so a DB leak can't be brute-forced offline. */
export const hmac = (purpose: string, value: string) =>
  createHmac("sha256", config().APP_SECRET).update(`${purpose}:${value}`).digest("hex");

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sixDigitCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
