"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Crosshair, Loader2, Plus, Trash2, Copy, CornerDownRight } from "lucide-react";
import { listingInput, type ListingInput } from "@/lib/listing-schema";
import { CYCLE_LABEL, GROUP_LABEL, fmtHour, isSlotCycle, type Cycle, type Group } from "@/lib/rules";
import { createListingAction } from "@/app/actions/owner";
import { MediaPicker, type Uploaded } from "./uploader";
import { TypeIcon } from "./type-icon";
import { Button, Card, Field, GROUP_STYLE, Input, Select, Textarea, cx } from "./ui";

export type WizardType = { slug: string; name: string; group: Group; bookingMode: "LEASE" | "SLOT"; cycles: Cycle[]; canBeChild: boolean; canHaveChildren: boolean; unitNoun: string; icon: string; description: string };
export type WizardParent = { id: string; name: string; type: string; district: string; suburb: string; address: string; lat: number | null; lng: number | null };

type UnitDraft = { label: string; priceUgx: string; cycle: Cycle; depositUgx: string; sizeSqft: string; beds: string };
type Draft = Omit<ListingInput, "units" | "media" | "lat" | "lng" | "parentId"> & { parentId: string; lat: string; lng: string; units: UnitDraft[]; media: Uploaded[] };

const DRAFT_KEY = "ekifo-listing-draft-v2";
const SECURITY = ["Askari", "CCTV", "Perimeter wall", "Gated", "Electric fence", "Burglar-proof windows"];
const AMENITIES = {
  STAY: ["Wi-Fi", "Self-contained", "Furnished", "Parking", "Study room", "Kitchen", "Laundry area", "Near main road", "Backup generator"],
  BUSINESS: ["Shop frontage", "Near main road", "Parking", "Backup generator", "Lift", "Washrooms", "Loading bay", "Wi-Fi"],
  LEISURE: ["Floodlights", "Changing rooms", "Parking", "Sound system", "Bar service", "Catering allowed", "Seating", "Tents & shade", "Lifeguard", "Wi-Fi", "Backup generator"],
} as const;

const blankUnit = (t: WizardType | undefined): UnitDraft => ({
  label: `${t?.unitNoun ?? "Unit"} 1`, priceUgx: "", cycle: t?.cycles[0] ?? "PER_MONTH", depositUgx: "", sizeSqft: "", beds: t?.group === "STAY" ? "1" : "",
});

function toInput(d: Draft): unknown {
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(/[, ]/g, "")));
  return {
    ...d,
    parentId: d.parentId || null,
    lat: num(d.lat), lng: num(d.lng),
    units: d.units.map((u) => ({ ...u, priceUgx: num(u.priceUgx), depositUgx: isSlotCycle(u.cycle) ? null : num(u.depositUgx), sizeSqft: num(u.sizeSqft), beds: num(u.beds) })),
    media: d.media.map((m) => ({ url: m.url, kind: m.kind, publicId: m.publicId, checksum: m.checksum })),
  };
}

export function ListingWizard({ types, parents, forUser }: { types: WizardType[]; parents: WizardParent[]; forUser?: { id: string; name: string } }) {
  const router = useRouter();
  const byGroup = useMemo(() => {
    const out: Record<Group, WizardType[]> = { STAY: [], BUSINESS: [], LEISURE: [] };
    for (const t of types) out[t.group].push(t);
    return out;
  }, [types]);
  const empty: Draft = useMemo(() => ({
    name: "", type: "", parentId: "", district: "Kampala", suburb: "", address: "", lat: "", lng: "", description: "",
    openFrom: 6, openTo: 23, yaka: "PRIVATE", water: "NWSC", security: [], amenities: [], units: [blankUnit(undefined)], media: [],
  }), []);
  const draftKey = forUser ? `${DRAFT_KEY}-${forUser.id}` : DRAFT_KEY;

  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [pending, start] = useTransition();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const saved = { ...empty, ...JSON.parse(raw) } as Draft;
        if (saved.type && !types.some((t) => t.slug === saved.type)) saved.type = "";
        setD(saved);
      }
    } catch {}
    setLoaded(true);
  }, [draftKey, empty, types]);
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => { try { localStorage.setItem(draftKey, JSON.stringify(d)); } catch {} }, 400);
    return () => clearTimeout(t);
  }, [d, loaded, draftKey]);

  const type = types.find((t) => t.slug === d.type);
  const slotMode = type?.bookingMode === "SLOT";
  const group: Group = type?.group ?? "STAY";
  const parentOptions = type?.canBeChild ? parents.filter((p) => types.find((t) => t.slug === p.type)?.canHaveChildren) : [];
  const noun = type?.unitNoun ?? "Unit";

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const setUnit = (i: number, patch: Partial<UnitDraft>) => setD((p) => ({ ...p, units: p.units.map((u, j) => (j === i ? { ...u, ...patch } : u)) }));
  const toggle = (k: "security" | "amenities", v: string) => set(k, d[k].includes(v) ? d[k].filter((x) => x !== v) : [...d[k], v]);

  const pickType = (t: WizardType) =>
    setD((p) => ({
      ...p,
      type: t.slug,
      parentId: t.canBeChild ? p.parentId : "",
      amenities: p.type && types.find((x) => x.slug === p.type)?.group !== t.group ? [] : p.amenities,
      units: p.units.map((u, i) => ({ ...u, cycle: t.cycles.includes(u.cycle) ? u.cycle : t.cycles[0], label: p.type ? u.label : `${t.unitNoun} ${i + 1}`, beds: t.group === "STAY" ? u.beds || "1" : "" })),
      ...(t.bookingMode === "SLOT" ? { yaka: "INCLUSIVE" as const, water: p.water } : {}),
    }));

  const pickParent = (id: string) => {
    const par = parents.find((p) => p.id === id);
    setD((p) => par
      ? { ...p, parentId: id, district: par.district, suburb: par.suburb, address: par.address, lat: par.lat?.toString() ?? p.lat, lng: par.lng?.toString() ?? p.lng }
      : { ...p, parentId: "" });
  };

  // Validate with the same schema the server uses; show only errors belonging to the current step.
  const allErrors = useMemo(() => {
    const r = listingInput.safeParse(toInput(d));
    const out: Record<string, string> = {};
    if (!r.success) for (const i of r.error.issues) out[i.path.join(".")] ??= i.message;
    return out;
  }, [d]);
  const stepKeys = (s: number) => (k: string) =>
    s === 0 ? !k.startsWith("units") && !k.startsWith("media") : s === 1 ? k.startsWith("units") : k.startsWith("media");

  const next = () => {
    const errs = Object.fromEntries(Object.entries(allErrors).filter(([k]) => stepKeys(step)(k)));
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setStep((s) => s + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = () => {
    setErrors(allErrors);
    if (Object.keys(allErrors).length) {
      const first = Object.keys(allErrors)[0];
      setStep(first.startsWith("units") ? 1 : first.startsWith("media") ? 2 : 0);
      return;
    }
    setServerError(null);
    start(async () => {
      const r = await createListingAction(toInput(d) as ListingInput, forUser?.id);
      if (r.ok) {
        try { localStorage.removeItem(draftKey); } catch {}
        router.push(forUser ? `/spaces/${r.id}` : `/owner?created=${r.id}`);
      } else {
        setServerError(r.error);
        if (r.fieldErrors) setErrors(r.fieldErrors);
      }
    });
  };

  const err = (k: string) => errors[k];
  const STEPS = ["The space", slotMode ? "Spaces & prices" : "Units & prices", "Photos & video"];

  return (
    <div>
      {forUser ? <p className="mb-5 rounded-[var(--radius-control)] bg-sky-soft px-4 py-3 text-sm font-medium text-sky-ink">Listing on behalf of <b>{forUser.name}</b>. It goes live as soon as you submit.</p> : null}
      <ol className="mb-6 grid grid-cols-3 gap-2">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button type="button" onClick={() => i < step && setStep(i)} className="w-full text-left">
              <span className={cx("block h-1.5 rounded-full", i < step ? "bg-brand" : i === step ? "bg-navy" : "bg-line")} />
              <span className={cx("mt-1.5 flex items-center gap-1 text-xs font-semibold", i === step ? "text-ink" : "text-muted")}>
                {i < step ? <Check className="size-3.5 text-brand-ink" /> : null}{i + 1}. {s}
              </span>
            </button>
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <div className="space-y-5">
          <Card className="p-5">
            <p className="font-display text-lg font-bold">What are you listing?</p>
            {err("type") ? <p className="mt-1 text-xs font-medium text-danger">{err("type")}</p> : null}
            <div className="mt-4 space-y-5">
              {(Object.keys(byGroup) as Group[]).filter((gk) => byGroup[gk].length).map((gk) => (
                <div key={gk}>
                  <p className={cx("mb-2 flex items-center gap-2 text-sm font-semibold", GROUP_STYLE[gk].text)}><span className={cx("size-2 rounded-full", GROUP_STYLE[gk].dot)} aria-hidden /> {GROUP_LABEL[gk]}</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {byGroup[gk].map((t) => (
                      <button key={t.slug} type="button" onClick={() => pickType(t)} aria-pressed={d.type === t.slug}
                        className={cx("flex items-center gap-2.5 rounded-[var(--radius-control)] p-3 text-left text-sm font-semibold ring-1 ring-inset transition-colors",
                          d.type === t.slug ? cx(GROUP_STYLE[gk].chip, "ring-2", GROUP_STYLE[gk].ring) : "bg-white ring-line hover:ring-line-strong")}>
                        <TypeIcon name={t.icon} className="size-5 shrink-0" />
                        <span className="leading-tight">{t.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {type ? (
            <Card className="space-y-4 p-5">
              {parentOptions.length ? (
                <Field label="Is it inside one of your buildings?" hint="E.g. a rooftop or pool at your hotel. Seekers see it on the building's page too.">
                  <Select value={d.parentId} onChange={(e) => pickParent(e.target.value)}>
                    <option value="">No, it's standalone</option>
                    {parentOptions.map((p) => <option key={p.id} value={p.id}>Inside {p.name}</option>)}
                  </Select>
                </Field>
              ) : null}
              <Field label={slotMode ? "Name of the venue or space" : "Building name"} error={err("name")}>
                <Input value={d.name} onChange={(e) => set("name", e.target.value)} placeholder={slotMode ? "Skyline Rooftop Lounge" : group === "BUSINESS" ? "Kisementi Square Mall" : "Kikoni Heights Hostel"} />
              </Field>
              {d.parentId ? (
                <p className="flex items-center gap-1.5 rounded-[var(--radius-control)] bg-surface px-3 py-2 text-sm text-ink-3"><CornerDownRight className="size-4" aria-hidden /> Address and map pin copied from {parents.find((p) => p.id === d.parentId)?.name}.</p>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="District" error={err("district")}><Input value={d.district} onChange={(e) => set("district", e.target.value)} list="districts" /></Field>
                    <Field label="Suburb / area" error={err("suburb")}><Input value={d.suburb} onChange={(e) => set("suburb", e.target.value)} placeholder="Kikoni" list="suburbs" /></Field>
                  </div>
                  <datalist id="districts">{["Kampala", "Wakiso", "Mukono", "Entebbe", "Jinja", "Mbarara", "Gulu"].map((x) => <option key={x} value={x} />)}</datalist>
                  <datalist id="suburbs">{["Kikoni", "Wandegeya", "Makerere", "Najjera", "Ntinda", "Kansanga", "Kyambogo", "Bukoto", "Kisaasi", "Nakawa", "Kabalagala", "Muyenga", "Kololo", "Kyanja", "Munyonyo"].map((x) => <option key={x} value={x} />)}</datalist>
                  <Field label="Physical address / landmark" error={err("address")}><Input value={d.address} onChange={(e) => set("address", e.target.value)} placeholder="Behind Total petrol station, Kikoni road" /></Field>
                  <div>
                    <p className="mb-1.5 text-sm font-semibold">GPS pin <span className="font-normal text-muted">(lets people get directions)</span></p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" variant="outline" size="sm" disabled={locating} onClick={() => {
                        if (!navigator.geolocation) return;
                        setLocating(true);
                        navigator.geolocation.getCurrentPosition(
                          (pos) => { setD((p) => ({ ...p, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) })); setLocating(false); },
                          () => setLocating(false),
                          { enableHighAccuracy: true, timeout: 15_000 },
                        );
                      }}>{locating ? <Loader2 className="size-4 animate-spin" /> : <Crosshair className="size-4" />} Use my current location</Button>
                      <Input className="w-32" inputMode="decimal" value={d.lat} onChange={(e) => set("lat", e.target.value)} placeholder="Latitude" aria-label="Latitude" />
                      <Input className="w-32" inputMode="decimal" value={d.lng} onChange={(e) => set("lng", e.target.value)} placeholder="Longitude" aria-label="Longitude" />
                    </div>
                    {err("lat") || err("lng") ? <p className="mt-1 text-xs text-danger">That pin isn't in Uganda.</p> : <p className="mt-1 text-xs text-muted">Tip: stand at the gate when you tap it.</p>}
                  </div>
                </>
              )}

              {slotMode ? (
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Opens at"><Select value={d.openFrom} onChange={(e) => set("openFrom", Number(e.target.value))}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{fmtHour(h)}</option>)}</Select></Field>
                  <Field label="Closes at" error={err("openTo")}><Select value={d.openTo} onChange={(e) => set("openTo", Number(e.target.value))}>{Array.from({ length: 24 }, (_, h) => h + 1).map((h) => <option key={h} value={h}>{fmtHour(h)}</option>)}</Select></Field>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Electricity (Yaka)">
                    <Select value={d.yaka} onChange={(e) => set("yaka", e.target.value as Draft["yaka"])}>
                      <option value="PRIVATE">Private Yaka per unit</option><option value="SHARED">Shared Yaka</option><option value="INCLUSIVE">Included in rent</option><option value="NONE">No power</option>
                    </Select>
                  </Field>
                  <Field label="Water">
                    <Select value={d.water} onChange={(e) => set("water", e.target.value as Draft["water"])}>
                      <option value="NWSC">NWSC</option><option value="GRAVITY_TANK">Gravity tank</option><option value="BOTH">NWSC + tank</option><option value="NONE">None on site</option>
                    </Select>
                  </Field>
                </div>
              )}
              <ChipGroup label="Security" options={SECURITY} value={d.security} onToggle={(v) => toggle("security", v)} />
              <ChipGroup label={slotMode ? "What's included" : "Amenities"} options={[...AMENITIES[group]]} value={d.amenities} onToggle={(v) => toggle("amenities", v)} />
              <Field label="Description" hint={slotMode ? "Capacity, surface, what's allowed (music, catering, decor)…" : "Distance to campus or taxi stage, rules, curfew…"} error={err("description")}>
                <Textarea value={d.description} onChange={(e) => set("description", e.target.value)} maxLength={2000} rows={4} />
              </Field>
            </Card>
          ) : null}
        </div>
      ) : null}

      {step === 1 && type ? (
        <div className="space-y-3">
          {err("units") ? <p className="text-sm text-danger">{err("units")}</p> : null}
          {slotMode ? <p className="rounded-[var(--radius-control)] bg-sky-soft px-4 py-3 text-sm text-sky-ink">Guests pay the full price when they book. You're paid after each booking, minus FindEkifo's fee.</p> : null}
          {d.units.map((u, i) => {
            const slot = isSlotCycle(u.cycle);
            return (
              <Card key={i} className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="font-bold">{noun} {i + 1}</p>
                  <div className="flex gap-1">
                    <button type="button" className="rounded-lg p-1.5 text-muted hover:bg-surface" aria-label={`Duplicate ${noun.toLowerCase()}`}
                      onClick={() => setD((p) => ({ ...p, units: [...p.units.slice(0, i + 1), { ...u, label: nextLabel(u.label, p.units) }, ...p.units.slice(i + 1)] }))}><Copy className="size-4" /></button>
                    {d.units.length > 1 ? (
                      <button type="button" className="rounded-lg p-1.5 text-muted hover:bg-red-50 hover:text-danger" aria-label={`Remove ${noun.toLowerCase()}`} onClick={() => set("units", d.units.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
                    ) : null}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Field label="Name" error={err(`units.${i}.label`)}><Input value={u.label} onChange={(e) => setUnit(i, { label: e.target.value })} /></Field>
                  <Field label="Price (UGX)" error={err(`units.${i}.priceUgx`)}><Input inputMode="numeric" value={u.priceUgx} onChange={(e) => setUnit(i, { priceUgx: e.target.value })} placeholder={slot ? "80,000" : "1,200,000"} /></Field>
                  <Field label="Charged">
                    <Select value={u.cycle} onChange={(e) => setUnit(i, { cycle: e.target.value as Cycle })}>
                      {type.cycles.map((c) => <option key={c} value={c}>{CYCLE_LABEL[c].replace(/^per/, "Per")}</option>)}
                    </Select>
                  </Field>
                  {!slot ? (
                    <Field label="Deposit to reserve (UGX)" hint="Paid now via Mobile Money" error={err(`units.${i}.depositUgx`)}><Input inputMode="numeric" value={u.depositUgx} onChange={(e) => setUnit(i, { depositUgx: e.target.value })} placeholder="200,000" /></Field>
                  ) : null}
                  {group === "STAY" ? (
                    <Field label="Beds" error={err(`units.${i}.beds`)}><Input inputMode="numeric" value={u.beds} onChange={(e) => setUnit(i, { beds: e.target.value })} /></Field>
                  ) : (
                    <Field label="Size (sq ft)" hint="Optional" error={err(`units.${i}.sizeSqft`)}><Input inputMode="numeric" value={u.sizeSqft} onChange={(e) => setUnit(i, { sizeSqft: e.target.value })} /></Field>
                  )}
                </div>
                {u.cycle === "PER_EVENT_SLOT" ? <p className="mt-2 text-xs text-muted">Event slots are morning (8am–12pm), afternoon (1–5pm) and evening (6–11pm), within your opening hours.</p> : null}
              </Card>
            );
          })}
          <Button type="button" variant="outline" className="w-full" onClick={() => set("units", [...d.units, { ...d.units[d.units.length - 1], label: nextLabel(d.units[d.units.length - 1].label, d.units) }])}>
            <Plus className="size-4" /> Add another {noun.toLowerCase()}
          </Button>
        </div>
      ) : null}

      {step === 2 ? (
        <Card className="space-y-3 p-5">
          <p className="text-sm text-muted">Add at least 3 real photos — the entrance, the space itself, and what's included. A short video walk-through gets far more bookings. The first photo is the cover.</p>
          <MediaPicker value={d.media} onChange={(m) => set("media", m)} />
          {err("media") ? <p className="text-sm text-danger">{err("media")}</p> : null}
        </Card>
      ) : null}

      {serverError ? <p role="alert" className="mt-4 rounded-[var(--radius-control)] bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{serverError}</p> : null}

      <div className="mt-6 flex items-center justify-between gap-3">
        {step > 0 ? <Button type="button" variant="ghost" onClick={() => setStep((s) => s - 1)}>Back</Button> : <span />}
        {step < 2 ? (
          <Button type="button" onClick={next} disabled={!type}>Continue</Button>
        ) : (
          <Button type="button" onClick={submit} disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : null} {forUser ? "Publish listing" : "Submit for review"}</Button>
        )}
      </div>
    </div>
  );
}

function ChipGroup({ label, options, value, onToggle }: { label: string; options: string[]; value: string[]; onToggle: (v: string) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button key={o} type="button" onClick={() => onToggle(o)} aria-pressed={value.includes(o)}
            className={cx("rounded-full px-3 py-1.5 text-sm font-medium ring-1", value.includes(o) ? "bg-navy text-white ring-navy" : "bg-white ring-line")}>{o}</button>
        ))}
      </div>
    </div>
  );
}

/** "Room 4" → "Room 5", "B12" → "B13"; skips labels already used. */
function nextLabel(label: string, units: { label: string }[]) {
  const used = new Set(units.map((u) => u.label.toLowerCase()));
  const m = label.match(/^(.*?)(\d+)$/);
  let n = m ? Number(m[2]) + 1 : 2;
  const base = m ? m[1] : `${label} `;
  while (used.has(`${base}${n}`.toLowerCase())) n++;
  return `${base}${n}`;
}
