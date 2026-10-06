"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Crosshair, Loader2, Plus, Trash2, Copy } from "lucide-react";
import { listingInput, type ListingInput } from "@/lib/listing-schema";
import { createListingAction } from "@/app/actions/owner";
import { MediaPicker, type Uploaded } from "./uploader";
import { Button, Card, Field, Input, Select, Textarea, cx } from "./ui";

type UnitDraft = { label: string; priceUgx: string; cycle: "PER_DAY" | "PER_MONTH" | "PER_SEMESTER"; depositUgx: string; sizeSqft: string; beds: string };
type Draft = Omit<ListingInput, "units" | "media" | "lat" | "lng"> & { lat: string; lng: string; units: UnitDraft[]; media: Uploaded[] };

const DRAFT_KEY = "ekifo-listing-draft-v1";
const SECURITY = ["Askari", "CCTV", "Perimeter wall", "Gated", "Electric fence", "Burglar-proof windows"];
const AMENITIES = ["Wi-Fi", "Self-contained", "Furnished", "Parking", "Study room", "Kitchen", "Laundry area", "Near main road", "Shop frontage", "Backup generator"];
const DEFAULT_CYCLE = { HOSTEL: "PER_SEMESTER", ARCADE: "PER_MONTH", RESIDENTIAL: "PER_MONTH", FLEXI_STAY: "PER_DAY" } as const;

const empty: Draft = {
  name: "", category: "HOSTEL", district: "Kampala", suburb: "", address: "", lat: "", lng: "", description: "",
  yaka: "PRIVATE", water: "NWSC", security: [], amenities: [],
  units: [{ label: "Room 1", priceUgx: "", cycle: "PER_SEMESTER", depositUgx: "", sizeSqft: "", beds: "1" }],
  media: [],
};

const STEPS = ["Property details", "Units & pricing", "Photos & video"];

function toInput(d: Draft): unknown {
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(/[, ]/g, "")));
  return {
    ...d,
    lat: num(d.lat), lng: num(d.lng),
    units: d.units.map((u) => ({ ...u, priceUgx: num(u.priceUgx), depositUgx: num(u.depositUgx), sizeSqft: num(u.sizeSqft), beds: num(u.beds) })),
    media: d.media.map((m) => ({ url: m.url, kind: m.kind, publicId: m.publicId, checksum: m.checksum })),
  };
}

export function ListingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [pending, start] = useTransition();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) setD({ ...empty, ...JSON.parse(raw) });
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch {} }, 400);
    return () => clearTimeout(t);
  }, [d, loaded]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const setUnit = (i: number, patch: Partial<UnitDraft>) => setD((p) => ({ ...p, units: p.units.map((u, j) => (j === i ? { ...u, ...patch } : u)) }));
  const toggle = (k: "security" | "amenities", v: string) => set(k, d[k].includes(v) ? d[k].filter((x) => x !== v) : [...d[k], v]);

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
      const r = await createListingAction(toInput(d) as ListingInput);
      if (r.ok) {
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
        router.push(`/owner?created=${r.id}`);
      } else {
        setServerError(r.error);
        if (r.fieldErrors) setErrors(r.fieldErrors);
      }
    });
  };

  const err = (k: string) => errors[k];

  return (
    <div>
      <ol className="mb-6 grid grid-cols-3 gap-2">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button type="button" onClick={() => i < step && setStep(i)} className="w-full text-left">
              <span className={cx("block h-1.5 rounded-full", i <= step ? "bg-brand" : "bg-line")} />
              <span className={cx("mt-1.5 flex items-center gap-1 text-xs font-semibold", i === step ? "text-navy" : "text-muted")}>
                {i < step ? <Check className="size-3.5 text-brand" /> : null}{i + 1}. {s}
              </span>
            </button>
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <Card className="space-y-4 p-5">
          <Field label="Building name" error={err("name")}><Input value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Kikoni Heights Hostel" /></Field>
          <Field label="Type of space">
            <div className="grid grid-cols-2 gap-2">
              {([["HOSTEL", "Hostel"], ["ARCADE", "Arcade / stalls"], ["RESIDENTIAL", "Apartment / house"], ["FLEXI_STAY", "Flexi-stay / Airbnb"]] as const).map(([v, l]) => (
                <button key={v} type="button" onClick={() => setD((p) => ({ ...p, category: v, units: p.units.map((u) => ({ ...u, cycle: DEFAULT_CYCLE[v] })) }))}
                  className={cx("rounded-xl border p-3 text-sm font-semibold", d.category === v ? "border-brand bg-brand-soft text-emerald-800" : "border-line bg-white")}>{l}</button>
              ))}
            </div>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="District" error={err("district")}><Input value={d.district} onChange={(e) => set("district", e.target.value)} list="districts" /></Field>
            <Field label="Suburb / area" error={err("suburb")}><Input value={d.suburb} onChange={(e) => set("suburb", e.target.value)} placeholder="Kikoni" list="suburbs" /></Field>
          </div>
          <datalist id="districts">{["Kampala", "Wakiso", "Mukono", "Entebbe", "Jinja", "Mbarara", "Gulu"].map((x) => <option key={x} value={x} />)}</datalist>
          <datalist id="suburbs">{["Kikoni", "Wandegeya", "Makerere", "Najjera", "Ntinda", "Kansanga", "Kyambogo", "Bukoto", "Kisaasi", "Nakawa", "Kabalagala", "Muyenga"].map((x) => <option key={x} value={x} />)}</datalist>
          <Field label="Physical address / landmark" error={err("address")}><Input value={d.address} onChange={(e) => set("address", e.target.value)} placeholder="Behind Total petrol station, Kikoni road" /></Field>
          <div>
            <p className="mb-1.5 text-sm font-semibold">GPS pin <span className="font-normal text-muted">(lets seekers get directions)</span></p>
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
          <ChipGroup label="Security" options={SECURITY} value={d.security} onToggle={(v) => toggle("security", v)} />
          <ChipGroup label="Amenities" options={AMENITIES} value={d.amenities} onToggle={(v) => toggle("amenities", v)} />
          <Field label="Description" hint="What makes it a good place? Distance to campus or taxi stage, rules, curfew…" error={err("description")}>
            <Textarea value={d.description} onChange={(e) => set("description", e.target.value)} maxLength={2000} rows={4} />
          </Field>
        </Card>
      ) : null}

      {step === 1 ? (
        <div className="space-y-3">
          {err("units") ? <p className="text-sm text-danger">{err("units")}</p> : null}
          {d.units.map((u, i) => (
            <Card key={i} className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-bold">Unit {i + 1}</p>
                <div className="flex gap-1">
                  <button type="button" className="rounded-lg p-1.5 text-muted hover:bg-surface" aria-label="Duplicate unit"
                    onClick={() => setD((p) => ({ ...p, units: [...p.units.slice(0, i + 1), { ...u, label: nextLabel(u.label, p.units) }, ...p.units.slice(i + 1)] }))}><Copy className="size-4" /></button>
                  {d.units.length > 1 ? (
                    <button type="button" className="rounded-lg p-1.5 text-muted hover:bg-red-50 hover:text-danger" aria-label="Remove unit" onClick={() => set("units", d.units.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
                  ) : null}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field label={d.category === "ARCADE" ? "Stall / shop no." : "Room / unit name"} error={err(`units.${i}.label`)}><Input value={u.label} onChange={(e) => setUnit(i, { label: e.target.value })} /></Field>
                <Field label="Price (UGX)" error={err(`units.${i}.priceUgx`)}><Input inputMode="numeric" value={u.priceUgx} onChange={(e) => setUnit(i, { priceUgx: e.target.value })} placeholder="1,200,000" /></Field>
                <Field label="Charged">
                  <Select value={u.cycle} onChange={(e) => setUnit(i, { cycle: e.target.value as UnitDraft["cycle"] })}>
                    <option value="PER_SEMESTER">Per semester</option><option value="PER_MONTH">Per month</option><option value="PER_DAY">Per day</option>
                  </Select>
                </Field>
                <Field label="Deposit to reserve (UGX)" hint="Paid now via Mobile Money" error={err(`units.${i}.depositUgx`)}><Input inputMode="numeric" value={u.depositUgx} onChange={(e) => setUnit(i, { depositUgx: e.target.value })} placeholder="200,000" /></Field>
                {d.category === "ARCADE" ? (
                  <Field label="Size (sq ft)" error={err(`units.${i}.sizeSqft`)}><Input inputMode="numeric" value={u.sizeSqft} onChange={(e) => setUnit(i, { sizeSqft: e.target.value })} /></Field>
                ) : (
                  <Field label="Beds" error={err(`units.${i}.beds`)}><Input inputMode="numeric" value={u.beds} onChange={(e) => setUnit(i, { beds: e.target.value })} /></Field>
                )}
              </div>
            </Card>
          ))}
          <Button type="button" variant="outline" className="w-full" onClick={() => set("units", [...d.units, { ...d.units[d.units.length - 1], label: nextLabel(d.units[d.units.length - 1].label, d.units) }])}>
            <Plus className="size-4" /> Add another unit
          </Button>
        </div>
      ) : null}

      {step === 2 ? (
        <Card className="space-y-3 p-5">
          <p className="text-sm text-muted">Add at least 3 real photos — front gate, a room, the washroom. A short video walk-through gets far more bookings. The first photo is the cover.</p>
          <MediaPicker value={d.media} onChange={(m) => set("media", m)} />
          {err("media") ? <p className="text-sm text-danger">{err("media")}</p> : null}
        </Card>
      ) : null}

      {serverError ? <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{serverError}</p> : null}

      <div className="mt-6 flex items-center justify-between gap-3">
        {step > 0 ? <Button type="button" variant="ghost" onClick={() => setStep((s) => s - 1)}>Back</Button> : <span />}
        {step < 2 ? (
          <Button type="button" onClick={next}>Continue</Button>
        ) : (
          <Button type="button" onClick={submit} disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : null} Submit for review</Button>
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
