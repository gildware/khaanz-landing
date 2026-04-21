"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { SITE } from "@/lib/site";
import type {
  PaymentMethodConfig,
  RestaurantSettingsPayload,
} from "@/types/restaurant-settings";

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [whatsappPhoneE164, setWhatsappPhoneE164] = useState("");
  const [pickupStart, setPickupStart] = useState("11:00");
  const [pickupEnd, setPickupEnd] = useState("23:00");
  const [deliveryStart, setDeliveryStart] = useState("11:00");
  const [deliveryEnd, setDeliveryEnd] = useState("23:00");
  const [billHeader, setBillHeader] = useState("");
  const [billFooter, setBillFooter] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodConfig[]>([
    { id: "cash", name: "Cash" },
    { id: "upi", name: "UPI" },
    { id: "mpay", name: "Mpay" },
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/settings", { credentials: "include" });
      if (!res.ok) {
        toast.error("Could not load settings");
        return;
      }
      const data = (await res.json()) as RestaurantSettingsPayload;
      setDisplayName(data.displayName ?? "");
      setLogoUrl(data.logoUrl ?? "");
      setWhatsappPhoneE164(data.whatsappPhoneE164);
      setPickupStart(data.pickup.start);
      setPickupEnd(data.pickup.end);
      setDeliveryStart(data.delivery.start);
      setDeliveryEnd(data.delivery.end);
      setBillHeader(data.billHeader ?? "");
      setBillFooter(data.billFooter ?? "");
      if (data.paymentMethods?.length) {
        setPaymentMethods(data.paymentMethods);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const payload: RestaurantSettingsPayload = {
        displayName,
        logoUrl,
        whatsappPhoneE164: whatsappPhoneE164.replace(/\D/g, ""),
        pickup: { start: pickupStart, end: pickupEnd },
        delivery: { start: deliveryStart, end: deliveryEnd },
        billHeader,
        billFooter,
        paymentMethods,
      };
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let msg = "Save failed";
        try {
          const j = (await res.json()) as { error?: string };
          if (j.error) msg = j.error;
        } catch {
          /* ignore */
        }
        toast.error(msg);
        return;
      }
      toast.success("Settings saved");
      await load();
    } finally {
      setSaving(false);
    }
  };

  const updatePaymentRow = (
    index: number,
    patch: Partial<PaymentMethodConfig>,
  ) => {
    setPaymentMethods((rows) =>
      rows.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  };

  const removePaymentRow = (index: number) => {
    setPaymentMethods((rows) => rows.filter((_, i) => i !== index));
  };

  const addPaymentRow = () => {
    setPaymentMethods((rows) => [
      ...rows,
      { id: `method_${rows.length + 1}`, name: "New" },
    ]);
  };

  const previewLogoSrc = logoUrl.trim() || SITE.logoPath;
  const previewName = displayName.trim() || SITE.name;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2Icon className="size-5 animate-spin" />
        Loading settings…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="font-semibold text-2xl">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Restaurant name, logo, hours, POS bill copy, and payment methods.
          Stored in the database.
        </p>
      </div>

      <Tabs defaultValue="general" className="w-full gap-6">
        <TabsList variant="line" className="h-auto min-h-9 w-full flex-wrap justify-start gap-0">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="timing">Timing</TabsTrigger>
          <TabsTrigger value="bill">Bill settings</TabsTrigger>
          <TabsTrigger value="payment">Payment methods</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="rest-name">Restaurant name</Label>
            <Input
              id="rest-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={SITE.name}
              maxLength={120}
            />
            <p className="text-muted-foreground text-xs">
              Shown where the app uses a configurable name. Leave empty to use
              the default ({SITE.name}).
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="logo-url">Logo</Label>
            <Input
              id="logo-url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder={SITE.logoPath}
              className="font-mono text-sm"
              maxLength={500}
            />
            <p className="text-muted-foreground text-xs">
              Public URL or site path (e.g. {SITE.logoPath} or a hosted image
              URL). Leave empty to use the default logo.
            </p>
            <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border bg-background">
                <Image
                  src={previewLogoSrc}
                  alt={`${previewName} logo preview`}
                  fill
                  className="object-contain p-1"
                  unoptimized={
                    previewLogoSrc.startsWith("http://") ||
                    previewLogoSrc.startsWith("https://")
                  }
                />
              </div>
              <div className="min-w-0 text-sm">
                <p className="font-medium leading-tight">{previewName}</p>
                <p className="text-muted-foreground truncate text-xs">
                  Preview
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wa-phone">WhatsApp number (orders)</Label>
            <Input
              id="wa-phone"
              value={whatsappPhoneE164}
              onChange={(e) => setWhatsappPhoneE164(e.target.value)}
              placeholder="919876543210"
              className="font-mono"
            />
            <p className="text-muted-foreground text-xs">
              Digits only, with country code (e.g. India 91…). No spaces or +.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="timing" className="space-y-6">
          <div className="space-y-3 rounded-xl border bg-card p-4">
            <p className="font-medium">Pickup</p>
            <p className="text-muted-foreground text-xs">
              When customers can place pickup orders (local time).
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="pu-start">Opens</Label>
                <Input
                  id="pu-start"
                  type="time"
                  value={pickupStart}
                  onChange={(e) => setPickupStart(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pu-end">Closes</Label>
                <Input
                  id="pu-end"
                  type="time"
                  value={pickupEnd}
                  onChange={(e) => setPickupEnd(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border bg-card p-4">
            <p className="font-medium">Delivery</p>
            <p className="text-muted-foreground text-xs">
              When customers can place delivery orders (local time).
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="dl-start">Opens</Label>
                <Input
                  id="dl-start"
                  type="time"
                  value={deliveryStart}
                  onChange={(e) => setDeliveryStart(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dl-end">Closes</Label>
                <Input
                  id="dl-end"
                  type="time"
                  value={deliveryEnd}
                  onChange={(e) => setDeliveryEnd(e.target.value)}
                />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="bill" className="space-y-6">
          <div className="space-y-3 rounded-xl border bg-card p-4">
            <p className="font-medium">POS bill &amp; KOT header/footer</p>
            <p className="text-muted-foreground text-xs">
              Shown on customer bills and KOT headers. One line per line break.
            </p>
            <div className="space-y-2">
              <Label htmlFor="bill-h">Bill header (optional)</Label>
              <Textarea
                id="bill-h"
                value={billHeader}
                onChange={(e) => setBillHeader(e.target.value)}
                rows={3}
                placeholder="e.g. Restaurant name, address, GSTIN"
                className="resize-y font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bill-f">Bill footer (optional)</Label>
              <Textarea
                id="bill-f"
                value={billFooter}
                onChange={(e) => setBillFooter(e.target.value)}
                rows={3}
                placeholder="e.g. Thank you — visit again"
                className="resize-y font-mono text-sm"
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="payment" className="space-y-6">
          <div className="space-y-3 rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium">Payment methods (POS)</p>
                <p className="text-muted-foreground text-xs">
                  Stable id (lowercase, a–z, digits, _-). Shown on bills.
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={addPaymentRow}>
                <PlusIcon className="size-4" />
                Add
              </Button>
            </div>
            <div className="space-y-2">
              {paymentMethods.map((row, idx) => (
                <div key={`${row.id}-${idx}`} className="flex flex-wrap gap-2">
                  <Input
                    className="max-w-[140px] font-mono text-xs"
                    placeholder="id"
                    value={row.id}
                    onChange={(e) =>
                      updatePaymentRow(idx, {
                        id: e.target.value
                          .trim()
                          .toLowerCase()
                          .replace(/[^a-z0-9_-]/g, ""),
                      })
                    }
                  />
                  <Input
                    className="min-w-0 flex-1"
                    placeholder="Name"
                    value={row.name}
                    onChange={(e) =>
                      updatePaymentRow(idx, { name: e.target.value })
                    }
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="shrink-0 text-muted-foreground"
                    onClick={() => removePaymentRow(idx)}
                    aria-label="Remove"
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Button
        type="button"
        className="w-full sm:w-auto"
        disabled={saving}
        onClick={() => void save()}
      >
        {saving ? (
          <>
            <Loader2Icon className="mr-2 size-4 animate-spin" />
            Saving…
          </>
        ) : (
          "Save settings"
        )}
      </Button>
    </div>
  );
}
