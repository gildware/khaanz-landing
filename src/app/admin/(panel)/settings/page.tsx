"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RestaurantSettingsPayload } from "@/types/restaurant-settings";

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [whatsappPhoneE164, setWhatsappPhoneE164] = useState("");
  const [pickupStart, setPickupStart] = useState("11:00");
  const [pickupEnd, setPickupEnd] = useState("23:00");
  const [deliveryStart, setDeliveryStart] = useState("11:00");
  const [deliveryEnd, setDeliveryEnd] = useState("23:00");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/settings", { credentials: "include" });
      if (!res.ok) {
        toast.error("Could not load settings");
        return;
      }
      const data = (await res.json()) as RestaurantSettingsPayload;
      setWhatsappPhoneE164(data.whatsappPhoneE164);
      setPickupStart(data.pickup.start);
      setPickupEnd(data.pickup.end);
      setDeliveryStart(data.delivery.start);
      setDeliveryEnd(data.delivery.end);
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
        whatsappPhoneE164: whatsappPhoneE164.replace(/\D/g, ""),
        pickup: { start: pickupStart, end: pickupEnd },
        delivery: { start: deliveryStart, end: deliveryEnd },
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

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2Icon className="size-5 animate-spin" />
        Loading settings…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div>
        <h1 className="font-semibold text-2xl">Restaurant settings</h1>
        <p className="text-muted-foreground text-sm">
          Pickup and delivery hours, and the WhatsApp number orders are sent to.
          Stored in{" "}
          <code className="text-xs">data/settings.json</code>.
        </p>
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

      <div className="space-y-3 rounded-xl border bg-card p-4">
        <p className="font-medium">Pickup hours</p>
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
        <p className="font-medium">Delivery hours</p>
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
