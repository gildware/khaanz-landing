"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2Icon, SearchIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchPlaces, type GeocodeSearchHit } from "@/lib/geocode";
import { cn } from "@/lib/utils";

type LocationSearchProps = {
  onPick: (hit: GeocodeSearchHit) => void;
  disabled?: boolean;
};

export function LocationSearch({ onPick, disabled }: LocationSearchProps) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GeocodeSearchHit[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const runSearch = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const r = await searchPlaces(query);
      setResults(r);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(q);
    }, 320);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, runSearch]);

  return (
    <div ref={wrapRef} className="relative space-y-2">
      <Label htmlFor="location-search">Search location</Label>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="location-search"
          value={q}
          disabled={disabled}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            if (q.trim().length >= 2) void runSearch(q);
          }}
          placeholder="Area, street, landmark…"
          className="h-11 rounded-xl border-border bg-muted/30 pl-9"
          autoComplete="off"
        />
        {loading && (
          <Loader2Icon className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      {open && results.length > 0 && (
        <ul
          className="absolute left-0 right-0 top-full z-[800] mt-1 max-h-56 overflow-auto rounded-xl border border-border bg-popover py-1 text-sm text-popover-foreground shadow-lg"
          role="listbox"
        >
          {results.map((hit, i) => (
            <li key={`${hit.lat}-${hit.lon}-${i}`}>
              <button
                type="button"
                className={cn(
                  "w-full px-3 py-2.5 text-left hover:bg-muted",
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(hit);
                  setQ(hit.displayName.split(",")[0]?.trim() ?? "");
                  setOpen(false);
                }}
              >
                {hit.displayName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
