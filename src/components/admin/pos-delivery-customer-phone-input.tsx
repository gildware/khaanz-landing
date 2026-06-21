"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { DeliveryCustomerSuggestion } from "@/lib/delivery-customers";

type Props = {
  id?: string;
  phone: string;
  enabled: boolean;
  onPhoneChange: (phone: string) => void;
  onSelectCustomer: (customer: DeliveryCustomerSuggestion) => void;
  className?: string;
};

export function PosDeliveryCustomerPhoneInput({
  id,
  phone,
  enabled,
  onPhoneChange,
  onSelectCustomer,
  className,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<DeliveryCustomerSuggestion[]>(
    [],
  );

  const loadSuggestions = useCallback(async (query: string) => {
    if (!enabled) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: query });
      const res = await fetch(
        `/api/admin/pos/delivery-customers?${params.toString()}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        setSuggestions([]);
        return;
      }
      const data = (await res.json()) as {
        customers?: DeliveryCustomerSuggestion[];
      };
      setSuggestions(Array.isArray(data.customers) ? data.customers : []);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !open) return;
    const t = window.setTimeout(() => {
      void loadSuggestions(phone);
    }, phone.length > 0 ? 250 : 0);
    return () => window.clearTimeout(t);
  }, [enabled, open, phone, loadSuggestions]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const showDropdown = enabled && open && (loading || suggestions.length > 0);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <Input
        id={id}
        inputMode="numeric"
        value={phone}
        onChange={(e) => {
          onPhoneChange(e.target.value.replace(/\D/g, "").slice(0, 10));
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Phone — search past delivery customers"
        autoComplete="off"
        className="bg-background"
      />
      {showDropdown ? (
        <ul
          className="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-md border bg-popover py-1 text-sm shadow-md"
          role="listbox"
        >
          {loading && suggestions.length === 0 ? (
            <li className="px-3 py-2 text-muted-foreground">Searching…</li>
          ) : null}
          {suggestions.map((c) => (
            <li key={c.phoneDigits}>
              <button
                type="button"
                className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-accent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelectCustomer(c);
                  setOpen(false);
                }}
              >
                <span className="font-medium">{c.displayName}</span>
                <span className="text-muted-foreground tabular-nums">
                  {c.phoneDigits}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
