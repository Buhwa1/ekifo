import { z } from "zod";

// Parsed once at boot. A bad value fails loudly instead of silently mis-charging someone.
const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_SECRET: z.string().min(32, "APP_SECRET must be at least 32 characters"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  ADMIN_PHONES: z.string().default(""),

  COMMISSION_BPS: z.coerce.number().int().min(0).max(2000).default(400),
  WRITTEN_AGREEMENT_THRESHOLD: z.coerce.number().int().positive().default(500_000),
  RENT_INCREASE_CAP_BPS: z.coerce.number().int().min(0).default(1000),
  RENT_NOTICE_DAYS: z.coerce.number().int().min(0).default(30),
  HOLD_PAYMENT_WINDOW_MIN: z.coerce.number().int().min(2).max(60).default(15),
  HOLD_DURATION_HOURS: z.coerce.number().int().min(1).default(72),
  FREE_CANCEL_HOURS: z.coerce.number().int().min(0).default(24),
  MIN_PAYOUT_UGX: z.coerce.number().int().min(0).default(10_000),

  SMS_PROVIDER: z.enum(["console", "termii"]).default("console"),
  TERMII_API_KEY: z.string().optional(),
  TERMII_SENDER_ID: z.string().default("FindEkifo"),

  PAYMENT_PROVIDER: z.enum(["mock", "flutterwave"]).default("mock"),
  FLW_SECRET_KEY: z.string().optional(),
  FLW_WEBHOOK_HASH: z.string().optional(),

  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  CRON_SECRET: z.string().min(8).default("dev-cron-secret"),
});

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  // ALLOW_MOCK_PROVIDERS=1 lets a staging/demo deploy run without real money or SMS.
  if (env.NODE_ENV === "production" && process.env.ALLOW_MOCK_PROVIDERS !== "1") {
    if (env.PAYMENT_PROVIDER === "mock") throw new Error("PAYMENT_PROVIDER=mock is not allowed in production");
    if (env.SMS_PROVIDER === "console") throw new Error("SMS_PROVIDER=console is not allowed in production");
    if (env.PAYMENT_PROVIDER === "flutterwave" && (!env.FLW_SECRET_KEY || !env.FLW_WEBHOOK_HASH))
      throw new Error("FLW_SECRET_KEY and FLW_WEBHOOK_HASH are required for Flutterwave");
    if (env.SMS_PROVIDER === "termii" && !env.TERMII_API_KEY) throw new Error("TERMII_API_KEY is required");
  }
  return {
    ...env,
    adminPhones: new Set(env.ADMIN_PHONES.split(",").map((p) => p.trim()).filter(Boolean)),
    cloudinaryEnabled: Boolean(
      env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
    ),
  };
}

let cached: ReturnType<typeof load> | undefined;
export function config() {
  return (cached ??= load());
}
