"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth";
import { businessInput, createBusiness, setBusinessStatus, updateBusiness, type BusinessInput } from "@/lib/businesses";
import { run, type ActionResult } from "@/lib/errors";

const anyone = () => assertRole(["SEEKER", "LANDLORD", "ADMIN"]);

export type BusinessFormResult = { ok: true; slug: string; published: boolean } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function saveBusinessAction(input: BusinessInput, editId?: string): Promise<BusinessFormResult> {
  const parsed = businessInput.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[i.path.join(".")] ??= i.message;
    return { ok: false, error: parsed.error.issues[0].message, fieldErrors };
  }
  const res = await run(async () => {
    const user = await anyone();
    if (editId) return { slug: await updateBusiness(user, editId, parsed.data), published: true };
    const b = await createBusiness(user, parsed.data);
    return { slug: b.slug, published: b.status === "PUBLISHED" };
  });
  if (!res.ok) return res;
  revalidatePath("/directory");
  return { ok: true, slug: res.data!.slug, published: res.data!.published };
}

export async function setBusinessStatusAction(id: string, status: "PUBLISHED" | "HIDDEN"): Promise<ActionResult> {
  return run(async () => {
    await setBusinessStatus(await assertRole(["LANDLORD", "ADMIN"]), id, status);
    revalidatePath("/owner/directory");
    revalidatePath("/directory");
  }, status === "PUBLISHED" ? "Published to the directory" : "Hidden from the directory");
}
