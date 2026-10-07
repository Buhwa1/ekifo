"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Select } from "./ui";

/** Changing the order navigates immediately — no "Apply" button for a single choice. */
export function SortSelect({ value }: { value: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      <span className="sr-only sm:not-sr-only">Sort</span>
      <Select
        value={value}
        aria-label="Sort results"
        className="h-9 w-auto min-w-36 text-sm font-semibold"
        onChange={(e) => {
          const qs = new URLSearchParams(params.toString());
          qs.delete("page");
          if (e.target.value === "featured") qs.delete("sort");
          else qs.set("sort", e.target.value);
          start(() => router.push(qs.size ? `/?${qs}#results` : "/#results", { scroll: false }));
        }}
      >
        <option value="featured">Recommended</option>
        <option value="price_asc">Lowest price</option>
        <option value="price_desc">Highest price</option>
        <option value="rating">Best rated</option>
        <option value="newest">Newest</option>
      </Select>
    </label>
  );
}
