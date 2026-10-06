// Development seed: realistic Kampala-area inventory, one landlord awaiting verification,
// one listing awaiting review, so every screen has something to show.
// Usage: npm run db:seed   (wipes app tables first — never run against production)
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import * as S from "../db/schema";
import { refreshPropertyStats } from "../lib/inventory";
import { hmac } from "../lib/crypto";
import { explainDbError } from "./db-hint";

if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed production");

type Cat = "HOSTEL" | "ARCADE" | "RESIDENTIAL" | "FLEXI_STAY";
type Cyc = "PER_DAY" | "PER_MONTH" | "PER_SEMESTER";

const LISTINGS: Array<{
  name: string; category: Cat; district: string; suburb: string; address: string; lat: number; lng: number;
  yaka: "PRIVATE" | "SHARED" | "INCLUSIVE"; water: "NWSC" | "GRAVITY_TANK" | "BOTH"; security: string[]; amenities: string[];
  description: string; cycle: Cyc; price: number; deposit: number; prefix: string; n: number; occupied: number; owner: 0 | 1; featured?: boolean;
}> = [
  { name: "Kikoni Heights Hostel", category: "HOSTEL", district: "Kampala", suburb: "Kikoni", address: "Kikoni road, 300m from Makerere western gate", lat: 0.3365, lng: 32.5612, yaka: "PRIVATE", water: "BOTH", security: ["Askari", "CCTV", "Gated"], amenities: ["Wi-Fi", "Study room", "Self-contained"], description: "Self-contained single and double rooms a five-minute walk to Makerere. Reliable water with a backup tank, 24-hour askari, and a quiet study room. Holiday flexi-stays available between semesters.", cycle: "PER_SEMESTER", price: 1_400_000, deposit: 200_000, prefix: "Room ", n: 12, occupied: 7, owner: 0, featured: true },
  { name: "Wandegeya Students' Residence", category: "HOSTEL", district: "Kampala", suburb: "Wandegeya", address: "Off Bativa road, Wandegeya", lat: 0.3349, lng: 32.5718, yaka: "SHARED", water: "NWSC", security: ["Askari", "Perimeter wall"], amenities: ["Wi-Fi", "Kitchen", "Laundry area"], description: "Affordable shared and single rooms close to the Wandegeya taxi stage, markets and both campuses.", cycle: "PER_SEMESTER", price: 900_000, deposit: 150_000, prefix: "B", n: 10, occupied: 4, owner: 0 },
  { name: "Ntinda Mews Apartments", category: "RESIDENTIAL", district: "Kampala", suburb: "Ntinda", address: "Kigoowa road, Ntinda", lat: 0.3551, lng: 32.6155, yaka: "PRIVATE", water: "BOTH", security: ["CCTV", "Gated", "Electric fence"], amenities: ["Parking", "Self-contained", "Backup generator"], description: "Two-bedroom apartments with private Yaka meters, ample parking and a backup generator for the common areas. Direct landlord, no broker fees.", cycle: "PER_MONTH", price: 1_200_000, deposit: 400_000, prefix: "Apt ", n: 6, occupied: 3, owner: 1, featured: true },
  { name: "Najjera Garden Flats", category: "RESIDENTIAL", district: "Wakiso", suburb: "Najjera", address: "Najjera II, behind Shell", lat: 0.3816, lng: 32.6236, yaka: "PRIVATE", water: "NWSC", security: ["Askari", "Gated"], amenities: ["Parking", "Self-contained"], description: "One- and two-bedroom flats in a quiet compound with a garden, 10 minutes from Kira road.", cycle: "PER_MONTH", price: 650_000, deposit: 200_000, prefix: "Flat ", n: 8, occupied: 6, owner: 1 },
  { name: "Mukwano Arcade Stalls", category: "ARCADE", district: "Kampala", suburb: "Kampala Central", address: "Ben Kiwanuka street, downtown", lat: 0.3133, lng: 32.5768, yaka: "SHARED", water: "NWSC", security: ["CCTV", "Askari"], amenities: ["Shop frontage", "Near main road"], description: "Ground and first-floor stalls with heavy foot traffic. Shared desks and pop-up booths available by the day for traders testing the market.", cycle: "PER_MONTH", price: 850_000, deposit: 300_000, prefix: "Stall ", n: 14, occupied: 10, owner: 0 },
  { name: "Kansanga Pop-up Booths", category: "ARCADE", district: "Kampala", suburb: "Kansanga", address: "Ggaba road, opposite KIU", lat: 0.2935, lng: 32.6064, yaka: "INCLUSIVE", water: "NWSC", security: ["CCTV"], amenities: ["Shop frontage", "Near main road"], description: "Day-rate booths for pop-ups, product launches and weekend markets. Power included.", cycle: "PER_DAY", price: 35_000, deposit: 35_000, prefix: "Booth ", n: 8, occupied: 2, owner: 1 },
  { name: "Entebbe Lakeview Studio", category: "FLEXI_STAY", district: "Wakiso", suburb: "Entebbe", address: "Kitooro, 2km from Entebbe airport", lat: 0.0605, lng: 32.4647, yaka: "INCLUSIVE", water: "BOTH", security: ["Gated", "Askari"], amenities: ["Wi-Fi", "Furnished", "Kitchen", "Parking"], description: "Furnished studios for 1–3 month stays — ideal for consultants, interns and professionals on assignment. Wi-Fi and power included.", cycle: "PER_DAY", price: 90_000, deposit: 90_000, prefix: "Studio ", n: 4, occupied: 1, owner: 1, featured: true },
  { name: "Kyambogo Semester Break Rooms", category: "FLEXI_STAY", district: "Kampala", suburb: "Kyambogo", address: "Banda, near Kyambogo University main gate", lat: 0.3496, lng: 32.6303, yaka: "INCLUSIVE", water: "NWSC", security: ["Askari"], amenities: ["Wi-Fi", "Furnished"], description: "Hostel rooms open during semester breaks for interns, holiday students and budget travellers.", cycle: "PER_DAY", price: 25_000, deposit: 25_000, prefix: "R", n: 10, occupied: 0, owner: 0 },
];

(async () => {
  console.log("Seeding…");
  await db.execute(sql`truncate table audit_log, webhook_events, outbox, saved_spaces, flags, reviews, rent_changes, tenancies, ledger_entries, payouts, payments, holds, visit_requests, media, units, properties, landlord_verifications, otp_challenges, sessions, users restart identity cascade`);

  const [admin, ll0, ll1, pendingLl, seeker] = await db.insert(S.users).values([
    { phone: "+256700000001", name: "FindEkifo Admin", role: "ADMIN" },
    { phone: "+256772100200", name: "Sarah Nakato", role: "LANDLORD", landlordStatus: "VERIFIED" },
    { phone: "+256752300400", name: "Joseph Okello", role: "LANDLORD", landlordStatus: "VERIFIED" },
    { phone: "+256783500600", name: "Peter Ssemwogerere", role: "LANDLORD", landlordStatus: "PENDING" },
    { phone: "+256701234567", name: "Grace Atim", role: "SEEKER" },
  ]).returning();
  const owners = [ll0, ll1];

  for (const [i, u] of [ll0, ll1].entries()) {
    await db.insert(S.landlordVerifications).values({
      userId: u.id, fullName: u.name!, ninHash: hmac("nin", `CM9000000000${i}X`), ninLast4: `000${i}`,
      ninPhotoUrl: "/seed/placeholder.jpg", selfieUrl: "/seed/placeholder.jpg", authorityDocUrl: "/seed/placeholder.jpg",
      status: "VERIFIED", reviewerId: admin.id, reviewedAt: new Date(),
    });
  }
  await db.insert(S.landlordVerifications).values({
    userId: pendingLl.id, fullName: pendingLl.name!, ninHash: hmac("nin", "CM85000000PEND"), ninLast4: "PEND",
    ninPhotoUrl: "/seed/p2-front.jpg", selfieUrl: "/seed/p3-room.jpg", authorityDocUrl: "/seed/p4-front.jpg",
  });

  let palette = 0;
  for (const l of LISTINGS) {
    const [p] = await db.insert(S.properties).values({
      ownerId: owners[l.owner].id, name: l.name, category: l.category, district: l.district, suburb: l.suburb, address: l.address,
      lat: l.lat, lng: l.lng, yaka: l.yaka, water: l.water, security: l.security, amenities: l.amenities, description: l.description,
      status: "LIVE", publishedAt: new Date(Date.now() - palette * 86_400_000),
      featuredUntil: l.featured ? new Date(Date.now() + 30 * 86_400_000) : null,
    }).returning();
    await db.insert(S.units).values(Array.from({ length: l.n }, (_, k) => ({
      propertyId: p.id,
      label: `${l.prefix}${k + 1}`,
      priceUgx: l.price + (k % 3) * Math.round(l.price * 0.1 / 10_000) * 10_000,
      cycle: l.cycle,
      depositUgx: l.deposit,
      beds: l.category === "ARCADE" ? null : 1 + (k % 2),
      sizeSqft: l.category === "ARCADE" ? 80 + (k % 4) * 20 : null,
      status: (k < l.occupied ? "OCCUPIED" : "VACANT") as "OCCUPIED" | "VACANT",
    })));
    const pi = palette % 6;
    await db.insert(S.media).values(["front", "room", "corridor"].map((kind, pos) => ({
      propertyId: p.id, url: `/seed/p${pi}-${kind}.jpg`, kind: "PHOTO" as const, position: pos, checksum: `seed-${pi}-${kind}-${palette}`,
    })));
    await refreshPropertyStats(db, p.id);
    palette++;
  }

  // A listing waiting for review, from the landlord whose ID is still pending.
  const [pend] = await db.insert(S.properties).values({
    ownerId: pendingLl.id, name: "Bukoto Courts", category: "RESIDENTIAL", district: "Kampala", suburb: "Bukoto", address: "Bukoto street, near Kisementi",
    lat: 0.3462, lng: 32.5951, yaka: "PRIVATE", water: "NWSC", security: ["Gated"], amenities: ["Parking"], status: "PENDING_REVIEW",
    description: "Newly built one-bedroom units.",
  }).returning();
  await db.insert(S.units).values([1, 2, 3].map((k) => ({ propertyId: pend.id, label: `Unit ${k}`, priceUgx: 900_000, cycle: "PER_MONTH" as const, depositUgx: 300_000 })));
  await db.insert(S.media).values([0, 1, 2].map((pos) => ({ propertyId: pend.id, url: `/seed/p${(pos + 2) % 6}-${["front", "room", "corridor"][pos]}.jpg`, position: pos })));
  await refreshPropertyStats(db, pend.id);
  await db.insert(S.flags).values({ kind: "USER_REPORT", reporterId: seeker.id, reason: "Caretaker asked me for a 20,000 viewing fee before showing the room." , propertyId: (await db.select({ id: S.properties.id }).from(S.properties).where(sql`name = 'Wandegeya Students'' Residence'`))[0].id });

  console.log(`✓ ${LISTINGS.length + 1} properties, ${5} users`);
  console.log("  Admin     +256700000001 (0700 000 001)");
  console.log("  Landlord  +256772100200 (0772 100 200) · +256752300400");
  console.log("  Seeker    +256701234567 (0701 234 567)");
  console.log("  OTP codes print in the dev server console (SMS_PROVIDER=console).");
  await pool.end();
})().catch(async (e) => {
  console.error(explainDbError(e) ?? e);
  await pool.end();
  process.exit(1);
});
