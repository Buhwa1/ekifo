// Shared by the server (authoritative) and the listing wizard (instant feedback). No server imports here.
import { z } from "zod";

// ─── Validation schemas (shared with the wizard UI) ─────────────────────────
export const ugx = z.coerce.number().int("Whole shillings only").min(1_000, "Too low").max(500_000_000, "Too high");

export const unitInput = z.object({
  label: z.string().trim().min(1, "Give the unit a name").max(40),
  priceUgx: ugx,
  cycle: z.enum(["PER_DAY", "PER_MONTH", "PER_SEMESTER"]),
  depositUgx: ugx,
  sizeSqft: z.coerce.number().int().positive().max(100_000).optional().nullable(),
  beds: z.coerce.number().int().min(0).max(20).optional().nullable(),
}).refine((u) => u.depositUgx <= u.priceUgx * 3, { message: "Deposit can't exceed 3× the price", path: ["depositUgx"] });

export const mediaInput = z.object({
  url: z.string().url(),
  kind: z.enum(["PHOTO", "VIDEO", "TOUR_360", "FLOOR_PLAN"]).default("PHOTO"),
  publicId: z.string().optional().nullable(),
  checksum: z.string().optional().nullable(),
});

export const listingInput = z.object({
  name: z.string().trim().min(3, "Building name is too short").max(80),
  category: z.enum(["HOSTEL", "ARCADE", "RESIDENTIAL", "FLEXI_STAY"]),
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

