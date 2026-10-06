import Link from "next/link";
import { desc, eq, and, sql } from "drizzle-orm";
import { db } from "@/db";
import { flags, properties, users, auditLog, holds } from "@/db/schema";
import { resolveFlagAction, suspendPropertyAction, suspendUserAction, adminRefundHoldAction, adminConfirmHoldAction } from "@/app/actions/admin";
import { ActionButton, ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Empty, Input, PageHeader, StatusBadge, dateTimeFmt } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit & flags" };

export default async function FlagsPage() {
  const [open, log] = await Promise.all([
    db.select({ f: flags, p: properties, owner: users, holdStatus: holds.status }).from(flags)
      .leftJoin(properties, eq(properties.id, flags.propertyId))
      .leftJoin(users, eq(users.id, properties.ownerId))
      .leftJoin(holds, eq(holds.id, flags.holdId))
      .where(eq(flags.status, "OPEN")).orderBy(desc(flags.createdAt)).limit(100),
    db.select({ a: auditLog, actor: users.phone }).from(auditLog).leftJoin(users, eq(users.id, auditLog.actorId)).orderBy(desc(auditLog.createdAt)).limit(40),
  ]);
  const ownerFlagCounts = await db.select({ ownerId: properties.ownerId, n: sql<number>`count(*)::int` }).from(flags)
    .innerJoin(properties, eq(properties.id, flags.propertyId)).where(and(eq(flags.kind, "USER_REPORT"))).groupBy(properties.ownerId);
  const reportsBy = new Map(ownerFlagCounts.map((r) => [r.ownerId, r.n]));

  return (
    <div className="space-y-10">
      <PageHeader title="Audit & flags" subtitle="User reports, duplicate-photo alerts, disputes and lapsed holds." />
      <section>
        {open.length ? open.map(({ f, p, owner, holdStatus }) => (
          <Card key={f.id} className="mb-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-bold">
                  <Badge tone={f.kind === "DUPLICATE_MEDIA" || f.kind === "USER_REPORT" ? "red" : "amber"}>{f.kind.replace(/_/g, " ").toLowerCase()}</Badge>
                  {p ? <Link href={`/spaces/${p.id}`} className="hover:underline">{p.name}</Link> : null}
                  {p ? <StatusBadge status={p.status} /> : null}
                </p>
                <p className="mt-1 text-sm">{f.reason}</p>
                <p className="mt-1 text-xs text-muted">{dateTimeFmt(f.createdAt)}{owner ? ` · owner ${owner.name ?? owner.phone} (${reportsBy.get(owner.id) ?? 0} reports total)` : ""}{holdStatus ? ` · hold ${holdStatus.toLowerCase()}` : ""}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-start gap-2">
              {f.holdId && holdStatus === "HELD" ? (
                <>
                  <ActionForm action={adminRefundHoldAction.bind(null, f.holdId)} confirm="Refund the tenant in full?"><SubmitButton size="sm" variant="danger">Refund tenant</SubmitButton></ActionForm>
                  <ActionButton action={adminConfirmHoldAction.bind(null, f.holdId)} confirm="Release escrow to the landlord?">Release to landlord</ActionButton>
                </>
              ) : null}
              {p && p.status === "LIVE" ? <ActionButton action={suspendPropertyAction.bind(null, p.id, true)} variant="danger" confirm="Hide this listing from search?">Suspend listing</ActionButton> : null}
              {p && p.status === "SUSPENDED" ? <ActionButton action={suspendPropertyAction.bind(null, p.id, false)}>Restore listing</ActionButton> : null}
              {owner && !owner.suspendedAt ? <ActionButton action={suspendUserAction.bind(null, owner.id, true)} variant="danger" confirm="Suspend this landlord's account and sign them out?">Suspend owner</ActionButton> : null}
              <ActionForm action={resolveFlagAction.bind(null, f.id, "RESOLVED")} className="flex gap-1">
                <Input name="note" placeholder="Resolution note" className="h-9 w-48" />
                <SubmitButton size="sm" variant="navy">Resolve</SubmitButton>
              </ActionForm>
              <ActionButton action={resolveFlagAction.bind(null, f.id, "DISMISSED")} variant="ghost">Dismiss</ActionButton>
            </div>
          </Card>
        )) : <Empty title="No open flags" />}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Audit log</h2>
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-white">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted"><tr><th className="p-3">When</th><th className="p-3">Who</th><th className="p-3">Action</th><th className="p-3">Entity</th></tr></thead>
            <tbody className="divide-y divide-line">
              {log.map(({ a, actor }) => (
                <tr key={a.id}><td className="p-3 whitespace-nowrap">{dateTimeFmt(a.createdAt)}</td><td className="p-3">{actor ?? "system"}</td><td className="p-3 font-mono text-xs">{a.action}</td><td className="p-3 font-mono text-xs text-muted">{a.entity}:{a.entityId.slice(0, 8)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
