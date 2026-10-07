// Development seed: realistic Kampala-area inventory across all three groups — places to stay,
// business spaces (with a shop directory) and leisure venues (booked by the hour or event slot),
// including a hotel and a mall that contain bookable spaces. One landlord is awaiting
// verification and one listing awaits review, so every screen has something to show.
// Usage: npm run db:seed   (wipes app tables first — never run against production)
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import * as S from "../db/schema";
import { refreshPropertyStats } from "../lib/inventory";
import { hmac } from "../lib/crypto";
import { explainDbError } from "./db-hint";

if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed production");

type Cyc = "PER_DAY" | "PER_MONTH" | "PER_SEMESTER" | "PER_HOUR" | "PER_EVENT_SLOT";
type Status = "VACANT" | "OCCUPIED" | "MAINTENANCE" | "UNDER_CONSTRUCTION";

interface L {
  key?: string; parent?: string;
  name: string; type: string; district: string; suburb: string; address: string; lat: number; lng: number;
  yaka?: "PRIVATE" | "SHARED" | "INCLUSIVE"; water?: "NWSC" | "GRAVITY_TANK" | "BOTH"; security: string[]; amenities: string[];
  description: string; owner: 0 | 1 | 2; featured?: boolean; openFrom?: number; openTo?: number;
  photos: string[];
  units: Array<{ label: string; price: number; cycle: Cyc; deposit?: number; beds?: number; size?: number; status?: Status }>;
}

const many = (prefix: string, n: number, price: number, cycle: Cyc, deposit: number, occupied: number, extra: Partial<{ beds: boolean; size: boolean; maintenance: number[]; construction: number[] }> = {}) =>
  Array.from({ length: n }, (_, k) => ({
    label: `${prefix}${k + 1}`,
    price: price + (k % 3) * Math.round((price * 0.1) / 10_000) * 10_000,
    cycle, deposit,
    beds: extra.beds ? 1 + (k % 2) : undefined,
    size: extra.size ? 80 + (k % 4) * 20 : undefined,
    status: (extra.maintenance?.includes(k) ? "MAINTENANCE" : extra.construction?.includes(k) ? "UNDER_CONSTRUCTION" : k < occupied ? "OCCUPIED" : "VACANT") as Status,
  }));
const pics = (i: number) => ["front", "room", "corridor"].map((k) => `/seed/p${i}-${k}.jpg`);

const LISTINGS: L[] = [
  // ── Stay ──
  { name: "Kikoni Heights Hostel", type: "hostel", district: "Kampala", suburb: "Kikoni", address: "Kikoni road, 300m from Makerere western gate", lat: 0.3365, lng: 32.5612, yaka: "PRIVATE", water: "BOTH", security: ["Askari", "CCTV", "Gated"], amenities: ["Wi-Fi", "Study room", "Self-contained"], description: "Self-contained single and double rooms a five-minute walk to Makerere. Reliable water with a backup tank, 24-hour askari, and a quiet study room.", owner: 0, featured: true, photos: pics(0), units: many("Room ", 12, 1_400_000, "PER_SEMESTER", 200_000, 6, { beds: true, maintenance: [11] }) },
  { name: "Wandegeya Students' Residence", type: "hostel", district: "Kampala", suburb: "Wandegeya", address: "Off Bativa road, Wandegeya", lat: 0.3349, lng: 32.5718, yaka: "SHARED", water: "NWSC", security: ["Askari", "Perimeter wall"], amenities: ["Wi-Fi", "Kitchen", "Laundry area"], description: "Affordable shared and single rooms close to the Wandegeya taxi stage, markets and both campuses. A new block opens next semester.", owner: 0, photos: pics(1), units: many("B", 10, 900_000, "PER_SEMESTER", 150_000, 4, { beds: true, construction: [7, 8, 9] }) },
  { name: "Ntinda Mews Apartments", type: "residential", district: "Kampala", suburb: "Ntinda", address: "Kigoowa road, Ntinda", lat: 0.3551, lng: 32.6155, yaka: "PRIVATE", water: "BOTH", security: ["CCTV", "Gated", "Electric fence"], amenities: ["Parking", "Self-contained", "Backup generator"], description: "Two-bedroom apartments with private Yaka meters, ample parking and a backup generator for the common areas. Direct landlord, no broker fees.", owner: 1, featured: true, photos: pics(2), units: many("Apt ", 6, 1_200_000, "PER_MONTH", 400_000, 3, { beds: true }) },
  { name: "Najjera Garden Flats", type: "residential", district: "Wakiso", suburb: "Najjera", address: "Najjera II, behind Shell", lat: 0.3816, lng: 32.6236, yaka: "PRIVATE", water: "NWSC", security: ["Askari", "Gated"], amenities: ["Parking", "Self-contained"], description: "One- and two-bedroom flats in a quiet compound with a garden, 10 minutes from Kira road.", owner: 1, photos: pics(3), units: many("Flat ", 8, 650_000, "PER_MONTH", 200_000, 6, { beds: true }) },
  { name: "Entebbe Lakeview Studio", type: "flexi_stay", district: "Wakiso", suburb: "Entebbe", address: "Kitooro, 2km from Entebbe airport", lat: 0.0605, lng: 32.4647, yaka: "INCLUSIVE", water: "BOTH", security: ["Gated", "Askari"], amenities: ["Wi-Fi", "Furnished", "Kitchen", "Parking"], description: "Furnished studios for 1–3 month stays — ideal for consultants, interns and professionals on assignment.", owner: 1, photos: pics(4), units: many("Studio ", 4, 90_000, "PER_DAY", 90_000, 1, { beds: true }) },

  // ── Hotel with spaces inside it ──
  { key: "hotel", name: "Kololo Summit Hotel", type: "hotel", district: "Kampala", suburb: "Kololo", address: "Upper Kololo Terrace", lat: 0.3311, lng: 32.5951, yaka: "INCLUSIVE", water: "BOTH", security: ["Askari", "CCTV", "Gated"], amenities: ["Wi-Fi", "Parking", "Backup generator", "Furnished"], description: "A boutique hotel on Kololo hill with a rooftop lounge and a heated pool you can book separately.", owner: 2, featured: true, photos: ["/seed/hotel.jpg", "/seed/p5-room.jpg", "/seed/p5-corridor.jpg"], units: many("Room ", 6, 280_000, "PER_DAY", 280_000, 2, { beds: true }) },
  { parent: "hotel", name: "Summit Rooftop Lounge", type: "lounge_rooftop", district: "Kampala", suburb: "Kololo", address: "Upper Kololo Terrace (8th floor)", lat: 0.3311, lng: 32.5951, security: ["Askari", "CCTV"], amenities: ["Sound system", "Bar service", "Seating", "Backup generator"], description: "City views from the 8th floor. Up to 80 guests standing. Our bar team can serve, or bring your own caterer.", owner: 2, openFrom: 8, openTo: 23, photos: ["/seed/rooftop.jpg", "/seed/bar.jpg", "/seed/hotel.jpg"], units: [{ label: "Whole rooftop", price: 1_800_000, cycle: "PER_EVENT_SLOT" }, { label: "Terrace corner", price: 150_000, cycle: "PER_HOUR" }] },
  { parent: "hotel", name: "Summit Pool Deck", type: "swimming_pool", district: "Kampala", suburb: "Kololo", address: "Upper Kololo Terrace (ground floor)", lat: 0.3311, lng: 32.5951, security: ["Lifeguard on duty"], amenities: ["Changing rooms", "Lifeguard", "Seating", "Bar service"], description: "A heated 20m pool. Book it for swim lessons, kids' parties or a private session.", owner: 2, openFrom: 7, openTo: 21, photos: ["/seed/pool.jpg", "/seed/hotel.jpg", "/seed/p5-room.jpg"], units: [{ label: "Private pool hire", price: 250_000, cycle: "PER_HOUR" }] },

  // ── Mall with shops (business hub) and a rooftop event space ──
  { key: "mall", name: "Kisementi Square Mall", type: "arcade", district: "Kampala", suburb: "Kisementi", address: "Acacia road, Kisementi", lat: 0.3378, lng: 32.5934, yaka: "SHARED", water: "NWSC", security: ["CCTV", "Askari"], amenities: ["Shop frontage", "Parking", "Lift", "Washrooms"], description: "Three floors of shops off Acacia road with steady weekend foot traffic. Ask about the new top-floor units.", owner: 0, featured: true, photos: ["/seed/mall.jpg", "/seed/shop0.jpg", "/seed/shop1.jpg"], units: [...many("A", 8, 1_500_000, "PER_MONTH", 500_000, 6, { size: true }), ...many("C", 4, 1_200_000, "PER_MONTH", 400_000, 0, { size: true, construction: [0, 1, 2, 3] })] },
  { parent: "mall", name: "Kisementi Sky Garden", type: "event_garden", district: "Kampala", suburb: "Kisementi", address: "Acacia road, Kisementi (rooftop)", lat: 0.3378, lng: 32.5934, security: ["CCTV", "Askari"], amenities: ["Tents & shade", "Sound system", "Catering allowed", "Parking"], description: "A landscaped rooftop garden for introductions, launches and birthday parties. Up to 200 guests.", owner: 0, openFrom: 8, openTo: 23, photos: ["/seed/garden.jpg", "/seed/mall.jpg", "/seed/rooftop.jpg"], units: [{ label: "Whole garden", price: 2_500_000, cycle: "PER_EVENT_SLOT" }] },
  { name: "Mukwano Arcade Stalls", type: "arcade", district: "Kampala", suburb: "Kampala Central", address: "Ben Kiwanuka street, downtown", lat: 0.3133, lng: 32.5768, yaka: "SHARED", water: "NWSC", security: ["CCTV", "Askari"], amenities: ["Shop frontage", "Near main road"], description: "Ground and first-floor stalls with heavy foot traffic. Pop-up booths available by the day.", owner: 0, photos: pics(5), units: many("Stall ", 14, 850_000, "PER_MONTH", 300_000, 10, { size: true }) },

  // ── Standalone leisure venues ──
  { name: "Kyanja Turf Arena", type: "turf_sports", district: "Kampala", suburb: "Kyanja", address: "Kyanja ring road, next to the market", lat: 0.3896, lng: 32.6053, security: ["Askari", "Perimeter wall"], amenities: ["Floodlights", "Changing rooms", "Parking", "Seating"], description: "Two five-a-side artificial turf pitches with floodlights for evening games. Bibs and balls included.", owner: 1, featured: true, openFrom: 6, openTo: 23, photos: ["/seed/turf.jpg", "/seed/turf.jpg", "/seed/p3-front.jpg"], units: [{ label: "Pitch A", price: 80_000, cycle: "PER_HOUR" }, { label: "Pitch B", price: 70_000, cycle: "PER_HOUR" }] },
  { name: "Munyonyo Lakeside Pool", type: "swimming_pool", district: "Kampala", suburb: "Munyonyo", address: "Munyonyo, off Salaama road", lat: 0.2414, lng: 32.6219, security: ["Gated"], amenities: ["Lifeguard", "Changing rooms", "Parking", "Tents & shade"], description: "An outdoor pool by the lake for swim classes, family days and private parties.", owner: 2, openFrom: 7, openTo: 19, photos: ["/seed/pool.jpg", "/seed/garden.jpg", "/seed/p4-front.jpg"], units: [{ label: "Lane hire", price: 60_000, cycle: "PER_HOUR" }, { label: "Whole pool", price: 900_000, cycle: "PER_EVENT_SLOT", status: "MAINTENANCE" }] },
  { name: "Bugolobi Taphouse", type: "bar", district: "Kampala", suburb: "Bugolobi", address: "Bandali Rise, Bugolobi", lat: 0.3179, lng: 32.6236, security: ["Askari", "CCTV"], amenities: ["Sound system", "Bar service", "Seating", "Wi-Fi"], description: "Reserve the back bar for birthdays, office parties and match nights. Big screens included.", owner: 1, openFrom: 12, openTo: 24, photos: ["/seed/bar.jpg", "/seed/club.jpg", "/seed/restaurant.jpg"], units: [{ label: "Back bar", price: 120_000, cycle: "PER_HOUR" }, { label: "Whole venue", price: 1_500_000, cycle: "PER_EVENT_SLOT" }] },
  { name: "Club Kabalagala", type: "club", district: "Kampala", suburb: "Kabalagala", address: "Ggaba road, Kabalagala", lat: 0.2963, lng: 32.5967, security: ["Askari", "CCTV"], amenities: ["Sound system", "Bar service", "Seating"], description: "VIP sections and full-club hire for launches and private nights.", owner: 2, openFrom: 13, openTo: 24, photos: ["/seed/club.jpg", "/seed/bar.jpg", "/seed/rooftop.jpg"], units: [{ label: "VIP section", price: 800_000, cycle: "PER_EVENT_SLOT" }] },
  { name: "Nakasero Garden Table", type: "restaurant", district: "Kampala", suburb: "Nakasero", address: "Nakasero road", lat: 0.3226, lng: 32.5796, security: ["Askari"], amenities: ["Catering allowed", "Seating", "Wi-Fi", "Parking"], description: "A private dining room for 24 guests. Set menus or bring your own cake.", owner: 0, openFrom: 8, openTo: 23, photos: ["/seed/restaurant.jpg", "/seed/garden.jpg", "/seed/p2-room.jpg"], units: [{ label: "Private dining room", price: 400_000, cycle: "PER_EVENT_SLOT" }, { label: "Garden table", price: 50_000, cycle: "PER_HOUR" }] },
];

const SHOPS = [
  { name: "Chloe's Boutique", unit: "Room A2", category: "Fashion & clothing", description: "Ladies' fashion, shoes and bags. New stock every Friday.", instagram: "chloesboutique.ug", tiktok: "chloesboutique", whatsapp: "+256772410100", hours: "Mon–Sat 9am–8pm", photos: ["/seed/shop0.jpg"] },
  { name: "Kampala Phone Doctor", unit: "Room A4", category: "Phones & electronics", description: "Screen repairs in an hour, phone accessories and genuine chargers.", whatsapp: "+256752410200", phone: "+256752410200", hours: "Daily 8am–9pm", photos: ["/seed/shop1.jpg", "/seed/shop4.jpg"] },
  { name: "Glow Beauty Bar", unit: "Room A5", category: "Beauty & salon", description: "Nails, lashes and braids. Walk-ins welcome before noon.", instagram: "glowbeautybar", whatsapp: "+256701410300", hours: "Tue–Sun 9am–7pm", photos: ["/seed/shop2.jpg"] },
  { name: "Bean & Crumb", unit: "Room A1", category: "Food & drinks", description: "Coffee, fresh pastries and lunch boxes to go.", instagram: "beanandcrumb.kla", facebook: "beanandcrumbkla", hours: "Daily 7am–7pm", photos: ["/seed/shop3.jpg"] },
  { name: "Stride Footwear", unit: "Room A7", category: "Shoes & bags", description: "Sneakers, school shoes and office shoes for the whole family.", tiktok: "stridefootwear", whatsapp: "+256783410500", photos: ["/seed/shop5.jpg"] },
];

(async () => {
  console.log("Seeding…");
  await db.execute(sql`truncate table audit_log, webhook_events, outbox, saved_spaces, flags, reviews, rent_changes, tenancies, ledger_entries, payouts, payments, holds, visit_requests, businesses, media, units, properties, landlord_verifications, otp_challenges, sessions, users restart identity cascade`);

  const [admin, ll0, ll1, ll2, pendingLl, seeker, shopkeeper] = await db.insert(S.users).values([
    { phone: "+256700000001", name: "FindEkifo Admin", role: "ADMIN" },
    { phone: "+256772100200", name: "Sarah Nakato", role: "LANDLORD", landlordStatus: "VERIFIED" },
    { phone: "+256752300400", name: "Joseph Okello", role: "LANDLORD", landlordStatus: "VERIFIED" },
    { phone: "+256772900800", name: "Diana Kemigisha", role: "LANDLORD", landlordStatus: "VERIFIED" },
    { phone: "+256783500600", name: "Peter Ssemwogerere", role: "LANDLORD", landlordStatus: "PENDING" },
    { phone: "+256701234567", name: "Grace Atim", role: "SEEKER" },
    { phone: "+256772410100", name: "Chloe Namara", role: "SEEKER" },
  ]).returning();
  const owners = [ll0, ll1, ll2];

  for (const [i, u] of owners.entries()) {
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

  const ids = new Map<string, string>();
  let n = 0;
  for (const l of LISTINGS) {
    const [p] = await db.insert(S.properties).values({
      ownerId: owners[l.owner].id, name: l.name, type: l.type, parentId: l.parent ? ids.get(l.parent)! : null,
      district: l.district, suburb: l.suburb, address: l.address, lat: l.lat, lng: l.lng,
      yaka: l.yaka ?? "INCLUSIVE", water: l.water ?? "NWSC", security: l.security, amenities: l.amenities, description: l.description,
      openFrom: l.openFrom ?? 6, openTo: l.openTo ?? 23,
      status: "LIVE", publishedAt: new Date(Date.now() - n * 86_400_000),
      featuredUntil: l.featured ? new Date(Date.now() + 30 * 86_400_000) : null,
    }).returning();
    if (l.key) ids.set(l.key, p.id);
    await db.insert(S.units).values(l.units.map((u) => ({
      propertyId: p.id, label: u.label, priceUgx: u.price, cycle: u.cycle,
      depositUgx: u.deposit ?? u.price, beds: u.beds ?? null, sizeSqft: u.size ?? null, status: u.status ?? "VACANT",
    })));
    await db.insert(S.media).values(l.photos.map((url, pos) => ({ propertyId: p.id, url, kind: "PHOTO" as const, position: pos, checksum: `seed-${n}-${pos}` })));
    await refreshPropertyStats(db, p.id);
    n++;
  }

  // Business hub: shops in Kisementi Square Mall.
  const mallId = ids.get("mall")!;
  for (const [i, s] of SHOPS.entries()) {
    await db.insert(S.businesses).values({
      slug: `${s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${(i + 10).toString(16)}a${i}`,
      propertyId: mallId, unitLabel: s.unit, ownerId: i === 0 ? shopkeeper.id : ll0.id,
      name: s.name, category: s.category, description: s.description,
      phone: s.phone ?? null, whatsapp: s.whatsapp ?? null, instagram: s.instagram ?? null, tiktok: s.tiktok ?? null, facebook: s.facebook ?? null,
      hours: s.hours ?? null, photos: s.photos, status: "PUBLISHED",
    });
  }
  // …and one waiting for the mall's approval.
  await db.insert(S.businesses).values({
    slug: "zawadi-crafts-pending1", propertyId: mallId, unitLabel: "Room A8", ownerId: seeker.id,
    name: "Zawadi Crafts", category: "Home & furniture", description: "Handmade baskets, mats and gifts.", whatsapp: "+256701234567",
    photos: ["/seed/shop4.jpg"], status: "PENDING",
  });

  // A listing waiting for review, from the landlord whose ID is still pending.
  const [pend] = await db.insert(S.properties).values({
    ownerId: pendingLl.id, name: "Bukoto Courts", type: "residential", district: "Kampala", suburb: "Bukoto", address: "Bukoto street, near Kisementi",
    lat: 0.3462, lng: 32.5951, yaka: "PRIVATE", water: "NWSC", security: ["Gated"], amenities: ["Parking"], status: "PENDING_REVIEW",
    description: "Newly built one-bedroom units.",
  }).returning();
  await db.insert(S.units).values([1, 2, 3].map((k) => ({ propertyId: pend.id, label: `Unit ${k}`, priceUgx: 900_000, cycle: "PER_MONTH" as const, depositUgx: 300_000 })));
  await db.insert(S.media).values([0, 1, 2].map((pos) => ({ propertyId: pend.id, url: `/seed/p${(pos + 2) % 6}-${["front", "room", "corridor"][pos]}.jpg`, position: pos })));
  await refreshPropertyStats(db, pend.id);
  await db.insert(S.flags).values({ kind: "USER_REPORT", reporterId: seeker.id, reason: "Caretaker asked me for a 20,000 viewing fee before showing the room.", propertyId: (await db.select({ id: S.properties.id }).from(S.properties).where(sql`name = 'Wandegeya Students'' Residence'`))[0].id });

  console.log(`✓ ${LISTINGS.length + 1} properties, ${SHOPS.length + 1} businesses, 7 users`);
  console.log("  Admin       0700 000 001");
  console.log("  Landlords   0772 100 200 (hostels, mall) · 0752 300 400 (flats, turf, bar) · 0772 900 800 (hotel, pool, club)");
  console.log("  Seeker      0701 234 567");
  console.log("  Shop owner  0772 410 100 (Chloe's Boutique)");
  console.log("  OTP codes print in the dev server console (SMS_PROVIDER=console).");
  await pool.end();
})().catch(async (e) => {
  console.error(explainDbError(e) ?? e);
  await pool.end();
  process.exit(1);
});
