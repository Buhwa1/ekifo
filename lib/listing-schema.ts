// Shared by the server (authoritative) and the listing wizard (instant feedback). No server imports here.
import { z } from "zod";

// ─── Validation schemas (shared with the wizard UI) ─────────────────────────
export const ugx = z.coerce.number().int("Whole shillings only").min(1_000, "Too low").max(500_000_000, "Too high");

export const CYCLES = ["PER_SEMESTER", "PER_MONTH", "PER_DAY", "PER_HOUR", "PER_EVENT_SLOT"] as const;
const SLOT = new Set<string>(["PER_HOUR", "PER_EVENT_SLOT"]);

export const unitInput = z.object({
  label: z.string().trim().min(1, "Give the unit a name").max(40),
  priceUgx: ugx,
  cycle: z.enum(CYCLES),
  /** Long stays: deposit to reserve. Time-slot bookings are paid in full, so this mirrors the price. */
  depositUgx: ugx.optional().nullable(),
  sizeSqft: z.coerce.number().int().positive().max(100_000).optional().nullable(),
  beds: z.coerce.number().int().min(0).max(20).optional().nullable(),
}).superRefine((u, ctx) => {
  if (SLOT.has(u.cycle)) return;
  if (u.depositUgx == null) ctx.addIssue({ code: "custom", message: "How much to reserve it?", path: ["depositUgx"] });
  else if (u.depositUgx > u.priceUgx * 3) ctx.addIssue({ code: "custom", message: "Deposit can't exceed 3× the price", path: ["depositUgx"] });
});

export const mediaInput = z.object({
  url: z.string().url(),
  kind: z.enum(["PHOTO", "VIDEO", "TOUR_360", "FLOOR_PLAN"]).default("PHOTO"),
  publicId: z.string().optional().nullable(),
  checksum: z.string().optional().nullable(),
});

export const listingInput = z.object({
  name: z.string().trim().min(3, "Building name is too short").max(80),
  type: z.string().trim().min(2, "Pick a type of space").max(32),
  parentId: z.string().uuid().optional().nullable(),
  openFrom: z.coerce.number().int().min(0).max(23).default(6),
  openTo: z.coerce.number().int().min(1).max(24).default(23),
  district: z.string().trim().min(2).max(40),
  suburb: z.string().trim().min(2).max(40),
  address: z.string().trim().min(5, "Add a landmark or street").max(200),
  lat: z.coerce.number().min(-1.6).max(4.3).optional().nullable(), // Uganda's bounding box
  lng: z.coerce.number().min(29.5).max(35.1).optional().nullable(),
  description: z.string().trim().max(2000).default(""),
  yaka: z.enum(["PRIVATE", "SHARED", "INCLUSIVE", "NONE"]),
  water: z.enum(["NWSC", "GRAVITY_TANK", "BOTH", "NONE"]),
  security: z.array(z.string().max(40)).max(10).default([]),
  amenities: z.array(z.string().max(40)).max(20).default([]),
  units: z.array(unitInput).min(1, "Add at least one unit").max(300),
  media: z.array(mediaInput).min(3, "Add at least 3 photos so seekers trust the listing").max(40),
}).superRefine((l, ctx) => {
  if (l.openTo <= l.openFrom) ctx.addIssue({ code: "custom", message: "Closing time must be after opening time", path: ["openTo"] });
  const seen = new Set<string>();
  l.units.forEach((u, i) => {
    const k = u.label.toLowerCase();
    if (seen.has(k)) ctx.addIssue({ code: "custom", message: "Duplicate unit name", path: ["units", i, "label"] });
    seen.add(k);
  });
});
export type ListingInput = z.infer<typeof listingInput>;

export const verificationInput = z.object({
  fullName: z.string().trim().min(3).max(80),
  nin: z.string().trim().toUpperCase().regex(/^C[MF][A-Z0-9]{12}$/, "NIN is 14 characters, starting CM or CF"),
  ninPhotoUrl: z.string().url(),
  selfieUrl: z.string().url(),
  authorityDocUrl: z.string().url(),
});

