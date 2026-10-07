import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { DomainError } from "./errors";
import { enqueueSms } from "./notify";
import { audit } from "./audit";
import { normalizeUgPhone } from "./rules";
import { config } from "./config";

export const onboardInput = z.object({
  name: z.string().trim().min(2, "Enter the client's name").max(80),
  phone: z.string().trim().min(9, "Enter a phone number"),
  verifiedInPerson: z.coerce.boolean().default(false),
  note: z.string().trim().max(300).optional().default(""),
});

/**
 * Admin sets up a landlord/venue owner directly — e.g. after meeting them, or for a mall signing a
 * deal. If the admin has checked their ID and ownership documents in person, they're VERIFIED
 * immediately; otherwise they complete verification themselves after signing in.
 */
export async function onboardClient(admin: { id: string }, input: z.infer<typeof onboardInput>) {
  const phone = normalizeUgPhone(input.phone);
  if (!phone) throw new DomainError("Enter a valid Ugandan mobile number.");
  if (config().adminPhones.has(phone)) throw new DomainError("That number belongs to a FindEkifo admin.");
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(users).where(eq(users.phone, phone)).for("update");
    if (existing?.suspendedAt) throw new DomainError("That account is suspended. Restore it from Flags before onboarding.");
    const status = input.verifiedInPerson ? "VERIFIED" : existing?.landlordStatus === "VERIFIED" ? "VERIFIED" : "NONE";
    const values = {
      name: input.name,
      role: existing?.role === "ADMIN" ? ("ADMIN" as const) : ("LANDLORD" as const),
      landlordStatus: status as "VERIFIED" | "NONE",
    };
    const [u] = existing
      ? await tx.update(users).set(values).where(eq(users.id, existing.id)).returning()
      : await tx.insert(users).values({ phone, ...values }).returning();
    const url = config().NEXT_PUBLIC_APP_URL;
    await enqueueSms(tx, phone, status === "VERIFIED"
      ? `Welcome to FindEkifo, ${input.name.split(" ")[0]}! Your verified owner account is ready. Sign in at ${url}/login with this number to manage your listings.`
      : `Welcome to FindEkifo, ${input.name.split(" ")[0]}! Sign in at ${url}/login with this number, then verify your ID to start listing.`);
    await audit(tx, admin.id, existing ? "client.update" : "client.onboard", "user", u.id, { verifiedInPerson: input.verifiedInPerson, note: input.note || null });
    return { id: u.id, created: !existing };
  });
}
