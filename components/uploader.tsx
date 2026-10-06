"use client";

import { useRef, useState } from "react";
import { Camera, CheckCircle2, Loader2, Upload, X } from "lucide-react";
import { cx } from "./ui";

export type Uploaded = { url: string; publicId: string | null; checksum: string | null; kind: "PHOTO" | "VIDEO" };

/** Compress big phone photos before upload — a 6 MB camera shot becomes ~300 KB, which matters on mobile data. */
async function shrink(file: File, maxSide = 1920, quality = 0.82): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/heic" || file.size < 600_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

export async function uploadFile(file: File, folder: "listings" | "kyc"): Promise<Uploaded> {
  const signRes = await fetch("/api/uploads/sign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder }) });
  const sign = await signRes.json();
  if (!signRes.ok) throw new Error(sign.error ?? "Upload unavailable");
  const body = new FormData();
  for (const [k, v] of Object.entries(sign.fields as Record<string, string>)) body.append(k, String(v));
  body.append("file", await shrink(file));
  const up = await fetch(sign.url, { method: "POST", body });
  const data = await up.json();
  if (!up.ok) throw new Error(data.error?.message ?? data.error ?? "Upload failed");
  return { url: data.secure_url, publicId: data.public_id ?? null, checksum: data.etag ?? null, kind: data.resource_type === "video" ? "VIDEO" : "PHOTO" };
}

/** Single-file field that writes the uploaded URL into a hidden input (for plain server-action forms). */
export function FileField({ name, label, hint, folder, accept = "image/*", capture }: {
  name: string; label: string; hint?: string; folder: "listings" | "kyc"; accept?: string; capture?: "user" | "environment";
}) {
  const [state, setState] = useState<{ status: "idle" | "busy" | "done" | "error"; url?: string; error?: string }>({ status: "idle" });
  const input = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold">{label}</p>
      <input type="hidden" name={name} value={state.url ?? ""} required />
      <button
        type="button"
        onClick={() => input.current?.click()}
        className={cx("flex w-full items-center gap-3 rounded-xl border-2 border-dashed p-3 text-left text-sm transition",
          state.status === "done" ? "border-brand bg-brand-soft" : state.status === "error" ? "border-red-300 bg-red-50" : "border-line bg-white hover:border-slate-300")}
      >
        {state.status === "busy" ? <Loader2 className="size-5 animate-spin text-muted" /> : state.status === "done" ? <CheckCircle2 className="size-5 text-brand" /> : capture ? <Camera className="size-5 text-muted" /> : <Upload className="size-5 text-muted" />}
        <span className="flex-1">
          {state.status === "done" ? "Uploaded — tap to replace" : state.status === "busy" ? "Uploading…" : state.status === "error" ? state.error : hint ?? "Tap to choose a file"}
        </span>
        {state.url && accept.startsWith("image") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={state.url} alt="" className="size-10 rounded-lg object-cover" />
        ) : null}
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        capture={capture}
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setState({ status: "busy" });
          try {
            const r = await uploadFile(f, folder);
            setState({ status: "done", url: r.url });
          } catch (err) {
            setState({ status: "error", error: (err as Error).message });
          }
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** Multi-file media picker for listings, with ordering by upload and remove. */
export function MediaPicker({ value, onChange }: { value: Uploaded[]; onChange: (v: Uploaded[]) => void }) {
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {value.map((m, i) => (
          <div key={m.url} className="relative aspect-square overflow-hidden rounded-xl bg-slate-100 ring-1 ring-line">
            {m.kind === "VIDEO" ? (
              <video src={m.url} className="size-full object-cover" muted preload="metadata" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.url} alt="" className="size-full object-cover" />
            )}
            {i === 0 ? <span className="absolute left-1.5 top-1.5 rounded-md bg-navy px-1.5 py-0.5 text-[10px] font-bold text-white">COVER</span> : null}
            <button type="button" onClick={() => onChange(value.filter((x) => x.url !== m.url))} className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white" aria-label="Remove">
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        {Array.from({ length: busy }, (_, i) => (
          <div key={`b${i}`} className="grid aspect-square place-items-center rounded-xl bg-slate-100"><Loader2 className="size-5 animate-spin text-muted" /></div>
        ))}
        <button type="button" onClick={() => input.current?.click()} className="grid aspect-square place-items-center rounded-xl border-2 border-dashed border-line bg-white text-sm font-semibold text-muted hover:border-brand hover:text-brand">
          <span className="flex flex-col items-center gap-1"><Camera className="size-6" /> Add</span>
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      <input
        ref={input}
        type="file"
        multiple
        accept="image/*,video/mp4,video/quicktime"
        className="hidden"
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          setError(null);
          setBusy((b) => b + files.length);
          const results: Uploaded[] = [];
          // 3 at a time: fast on Wi-Fi, doesn't choke a 3G connection.
          for (let i = 0; i < files.length; i += 3) {
            const batch = await Promise.allSettled(files.slice(i, i + 3).map((f) => uploadFile(f, "listings")));
            for (const r of batch) {
              if (r.status === "fulfilled") results.push(r.value);
              else setError(r.reason?.message ?? "Some files failed to upload");
            }
            setBusy((b) => b - Math.min(3, files.length - i));
          }
          onChange([...value, ...results]);
        }}
      />
    </div>
  );
}
