"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClockIcon,
  CheckIcon,
  Loader2Icon,
  MapPinIcon,
  NavigationIcon,
  PackageIcon,
  TruckIcon,
  ZapIcon,
} from "lucide-react";
import { toast } from "sonner";

import { LocationMapPicker } from "@/components/map/location-map-picker";
import { DEFAULT_CENTER } from "@/lib/map-constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { reverseGeocode } from "@/lib/geocode";
import { useRestaurantSettings } from "@/contexts/restaurant-settings-context";
import {
  isDeliveryOpen,
  isPickupOpen,
} from "@/lib/restaurant-hours";
import { useCartTotals } from "@/hooks/use-cart-totals";
import { useCartStore } from "@/store/cartStore";
import {
  assignWhatsAppOrderUrl,
  buildWaMeUrl,
  buildWhatsAppMessage,
} from "@/utils/whatsapp";
import type { FulfillmentMode } from "@/types/restaurant-settings";
import {
  ORDER_SCHEDULE_MAX_DAYS_AHEAD,
  ORDER_SCHEDULE_MIN_LEAD_MINUTES,
  dateToDatetimeLocalValue,
  formatScheduleHuman,
  getMaxScheduleDateFromNow,
  getMinScheduleDateFromNow,
  isScheduledTimeAllowed,
  parseDatetimeLocalValue,
  type ScheduleMode,
} from "@/lib/order-schedule";
import { cn } from "@/lib/utils";

function isValidIndianMobile(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(phone.replace(/\s/g, ""));
}

export function CheckoutForm() {
  const router = useRouter();
  const { lines, totalAmount } = useCartTotals();
  const clearCart = useCartStore((s) => s.clearCart);
  const { data: settings, isLoading: settingsLoading } =
    useRestaurantSettings();

  const [step, setStep] = useState(0);
  const [fulfillment, setFulfillment] = useState<FulfillmentMode>("delivery");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [landmark, setLandmark] = useState("");
  const [notes, setNotes] = useState("");
  const [latitude, setLatitude] = useState<number | null>(DEFAULT_CENTER[0]);
  const [longitude, setLongitude] = useState<number | null>(DEFAULT_CENTER[1]);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const [mapFlyTrigger, setMapFlyTrigger] = useState(0);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("asap");
  const [placingOrder, setPlacingOrder] = useState(false);
  const [scheduledAtLocal, setScheduledAtLocal] = useState("");

  const steps = useMemo(
    () =>
      fulfillment === "pickup"
        ? (["When & how", "Contact", "Review"] as const)
        : (["When & how", "Contact", "Location", "Review"] as const),
    [fulfillment],
  );

  const maxStepIndex = steps.length - 1;
  const currentStepLabel = steps[step] ?? steps[0];

  const position = useMemo(() => {
    const lat = latitude ?? DEFAULT_CENTER[0];
    const lng = longitude ?? DEFAULT_CENTER[1];
    return { lat, lng };
  }, [latitude, longitude]);

  const fetchAddress = useCallback(async (lat: number, lng: number) => {
    setAddressLoading(true);
    setGeoError(null);
    try {
      const a = await reverseGeocode(lat, lng);
      setAddress(a);
    } catch {
      setGeoError("Could not fetch address for this pin. Please type it in.");
    } finally {
      setAddressLoading(false);
    }
  }, []);

  useEffect(() => {
    if (latitude != null && longitude != null && currentStepLabel === "Location") {
      const handle = setTimeout(() => {
        void fetchAddress(latitude, longitude);
      }, 500);
      return () => clearTimeout(handle);
    }
  }, [latitude, longitude, currentStepLabel, fetchAddress]);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported in this browser.");
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        setMapFlyTrigger((n) => n + 1);
        setGeoLoading(false);
      },
      () => {
        setGeoError("Location permission denied. Move the pin or enter address manually.");
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  const handlePositionChange = (lat: number, lng: number) => {
    setLatitude(lat);
    setLongitude(lng);
  };

  const bothClosed =
    !!settings &&
    !isPickupOpen(settings) &&
    !isDeliveryOpen(settings);

  const channelOpen =
    !!settings &&
    !bothClosed &&
    (fulfillment === "pickup"
      ? isPickupOpen(settings)
      : isDeliveryOpen(settings));

  const minScheduleLocal = dateToDatetimeLocalValue(getMinScheduleDateFromNow());
  const maxScheduleLocal = dateToDatetimeLocalValue(getMaxScheduleDateFromNow());

  const scheduleOk = useMemo(() => {
    if (scheduleMode === "asap") return true;
    const d = parseDatetimeLocalValue(scheduledAtLocal);
    return d !== null && isScheduledTimeAllowed(d);
  }, [scheduleMode, scheduledAtLocal]);

  const canNextFromWhenHow =
    !settingsLoading && !!settings && channelOpen && scheduleOk;

  const canNextFromContact =
    name.trim().length > 0 && isValidIndianMobile(phone);

  const canNextFromLocation =
    latitude != null &&
    longitude != null &&
    address.trim().length > 0;

  const goNext = () => {
    if (currentStepLabel === "When & how" && !canNextFromWhenHow) return;
    if (currentStepLabel === "Contact" && !canNextFromContact) return;
    if (currentStepLabel === "Location" && !canNextFromLocation) return;
    setStep((s) => Math.min(s + 1, maxStepIndex));
  };

  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  useEffect(() => {
    if (step > maxStepIndex) {
      setStep(maxStepIndex);
    }
  }, [fulfillment, step, maxStepIndex]);

  const placeOrder = async () => {
    if (!settings) return;
    let scheduledIso: string | null = null;
    if (scheduleMode === "scheduled") {
      const d = parseDatetimeLocalValue(scheduledAtLocal);
      if (!d || !isScheduledTimeAllowed(d)) {
        toast.error(
          `Choose a time at least ${ORDER_SCHEDULE_MIN_LEAD_MINUTES} minutes from now.`,
        );
        return;
      }
      scheduledIso = d.toISOString();
    }

    setPlacingOrder(true);
    /** iOS Safari blocks `window.open` after `await`; open a tab in the same tap if we may need wa.me. */
    const needsWaMeFallback = settings.whatsappCloudConfigured !== true;
    let waMeFallbackWindow: Window | null = null;
    if (needsWaMeFallback) {
      waMeFallbackWindow = window.open("about:blank", "_blank");
    }

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: name.trim(),
          phone: phone.trim(),
          fulfillment,
          scheduleMode,
          scheduledAt: scheduleMode === "scheduled" ? scheduledIso : null,
          address: fulfillment === "delivery" ? address.trim() : "",
          landmark: fulfillment === "delivery" ? landmark.trim() : "",
          notes: notes.trim(),
          lines,
          latitude: fulfillment === "delivery" ? latitude : null,
          longitude: fulfillment === "delivery" ? longitude : null,
        }),
      });
      const raw = await res.text();
      let data: unknown = null;
      try {
        data = raw ? (JSON.parse(raw) as unknown) : null;
      } catch {
        data = null;
      }
      const errMsg =
        data &&
        typeof data === "object" &&
        "error" in data &&
        typeof (data as { error: unknown }).error === "string"
          ? (data as { error: string }).error
          : null;

      if (!res.ok) {
        const fallback =
          res.status === 504 || res.status === 408
            ? "Request timed out. Try again."
            : res.status >= 500
              ? "Server error. Try again in a moment."
              : null;
        toast.error(errMsg ?? fallback ?? "Could not place order. Try again.");
        return;
      }

      const orderId =
        data &&
        typeof data === "object" &&
        "orderId" in data &&
        typeof (data as { orderId: unknown }).orderId === "string"
          ? (data as { orderId: string }).orderId
          : null;
      const messageSentViaWhatsApp =
        data &&
        typeof data === "object" &&
        "messageSentViaWhatsApp" in data &&
        (data as { messageSentViaWhatsApp: unknown }).messageSentViaWhatsApp ===
          true;

      if (!orderId) {
        toast.error("Invalid response from server.");
        return;
      }

      clearCart();

      if (!messageSentViaWhatsApp) {
        const waText = `*Order ref:* ${orderId}\n\n${buildWhatsAppMessage(
          {
            customerName: name.trim(),
            phone: phone.trim(),
            fulfillment,
            scheduleMode,
            scheduledAt: scheduledIso,
            address: fulfillment === "delivery" ? address.trim() : "",
            landmark: fulfillment === "delivery" ? landmark.trim() : "",
            notes: notes.trim(),
            lines,
            latitude: fulfillment === "delivery" ? latitude : null,
            longitude: fulfillment === "delivery" ? longitude : null,
          },
          { useWhatsAppFormatting: true },
        )}`;
        const { href: waUrl, truncated } = buildWaMeUrl(
          waText,
          settings.whatsappPhoneE164,
        );
        if (truncated) {
          toast.success(
            "Full order was received — WhatsApp text is shortened to fit.",
          );
        }
        if (waMeFallbackWindow && !waMeFallbackWindow.closed) {
          try {
            waMeFallbackWindow.location.href = waUrl;
          } catch {
            toast.success("Order placed! Opening WhatsApp…");
            assignWhatsAppOrderUrl(waUrl, null);
            return;
          }
        } else {
          toast.success("Order placed! Opening WhatsApp…");
          assignWhatsAppOrderUrl(waUrl, null);
          return;
        }
      } else {
        waMeFallbackWindow?.close();
      }

      const q = new URLSearchParams();
      q.set("name", name.trim());
      q.set("order", orderId);
      q.set("sent", messageSentViaWhatsApp ? "1" : "0");
      router.push(`/success?${q.toString()}`);
    } catch {
      toast.error("Network error. Check your connection and try again.");
    } finally {
      setPlacingOrder(false);
    }
  };

  if (lines.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
        Your cart is empty. Add items from the menu first.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <StepperHeader step={step} steps={steps} />

      {currentStepLabel === "When & how" && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="space-y-2">
            <Label>How would you like to receive your order?</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFulfillment("delivery")}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-all",
                  fulfillment === "delivery"
                    ? "border-primary bg-primary/15 shadow-md shadow-primary/10"
                    : "border-border bg-muted/20 hover:border-border",
                )}
              >
                <TruckIcon className="size-8 text-primary" />
                <span className="font-semibold">Delivery</span>
                <span className="text-muted-foreground text-xs">
                  We bring it to your address
                </span>
              </button>
              <button
                type="button"
                onClick={() => setFulfillment("pickup")}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-all",
                  fulfillment === "pickup"
                    ? "border-primary bg-primary/15 shadow-md shadow-primary/10"
                    : "border-border bg-muted/20 hover:border-border",
                )}
              >
                <PackageIcon className="size-8 text-primary" />
                <span className="font-semibold">Pickup</span>
                <span className="text-muted-foreground text-xs">
                  Collect at the restaurant
                </span>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>
              {fulfillment === "delivery"
                ? "When should we deliver?"
                : "When do you want to pick up?"}
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setScheduleMode("asap");
                }}
                className={cn(
                  "flex min-h-0 items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-all",
                  scheduleMode === "asap"
                    ? "border-primary bg-primary/15 shadow-md shadow-primary/10"
                    : "border-border bg-muted/20 hover:border-border",
                )}
              >
                <ZapIcon className="size-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <span className="block font-semibold text-sm leading-tight">
                    ASAP
                  </span>
                  <span className="text-muted-foreground text-[11px] leading-snug">
                    As soon as ready
                  </span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setScheduleMode("scheduled");
                  setScheduledAtLocal((prev) =>
                    prev ||
                    dateToDatetimeLocalValue(getMinScheduleDateFromNow()),
                  );
                }}
                className={cn(
                  "flex min-h-0 items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-all",
                  scheduleMode === "scheduled"
                    ? "border-primary bg-primary/15 shadow-md shadow-primary/10"
                    : "border-border bg-muted/20 hover:border-border",
                )}
              >
                <CalendarClockIcon className="size-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <span className="block font-semibold text-sm leading-tight">
                    Custom time
                  </span>
                  <span className="text-muted-foreground text-[11px] leading-snug">
                    Min. {ORDER_SCHEDULE_MIN_LEAD_MINUTES} min ahead
                  </span>
                </div>
              </button>
            </div>
            {scheduleMode === "scheduled" && (
              <div className="space-y-2 pt-1">
                <Label htmlFor="schedule-at" className="text-muted-foreground">
                  Date and time
                </Label>
                <Input
                  id="schedule-at"
                  type="datetime-local"
                  min={minScheduleLocal}
                  max={maxScheduleLocal}
                  value={scheduledAtLocal}
                  onChange={(e) => setScheduledAtLocal(e.target.value)}
                  className="h-12 rounded-xl border-border bg-muted/30 font-mono text-sm"
                />
                <p className="text-muted-foreground text-xs">
                  Earliest: {ORDER_SCHEDULE_MIN_LEAD_MINUTES} minutes from now ·
                  Up to {ORDER_SCHEDULE_MAX_DAYS_AHEAD} days ahead.
                </p>
                {scheduledAtLocal.length > 0 && !scheduleOk && (
                  <p className="text-destructive text-xs">
                    Choose a valid time within the allowed window.
                  </p>
                )}
              </div>
            )}
          </div>

          {!settingsLoading && settings && bothClosed && (
            <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-100 text-sm">
              We are not accepting pickup or delivery orders right now (outside
              hours). Please try again when we are open.
            </p>
          )}
          {!settingsLoading && settings && !bothClosed && !channelOpen && (
            <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-100 text-sm">
              {fulfillment === "delivery"
                ? "Delivery is outside hours right now. Switch to pickup if it is available, or try again later."
                : "Pickup is outside hours right now. Switch to delivery if it is available, or try again later."}
            </p>
          )}
          {!settingsLoading && !settings && (
            <p className="text-destructive text-sm">
              Could not load restaurant hours. Check your connection and try again.
            </p>
          )}
        </div>
      )}

      {currentStepLabel === "Contact" && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="As on your doorbell"
              className="h-12 rounded-xl border-border bg-muted/30"
              autoComplete="name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone number</Label>
            <Input
              id="phone"
              inputMode="numeric"
              maxLength={10}
              value={phone}
              onChange={(e) =>
                setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
              }
              placeholder="10-digit mobile"
              className="h-12 rounded-xl border-border bg-muted/30"
              autoComplete="tel"
            />
            {phone.length > 0 && !isValidIndianMobile(phone) && (
              <p className="text-destructive text-xs">
                Enter a valid 10-digit Indian mobile number
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes-contact">
              Order notes{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="notes-contact"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                fulfillment === "delivery"
                  ? "Allergies, spice level, gate code…"
                  : "Estimated arrival time, car colour…"
              }
              rows={3}
              className="rounded-xl border-border bg-muted/30"
            />
          </div>
        </div>
      )}

      {currentStepLabel === "Location" && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              className="rounded-full"
              onClick={handleUseCurrentLocation}
              disabled={geoLoading}
            >
              {geoLoading ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <NavigationIcon className="size-4" />
              )}
              Use current location
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-border"
              onClick={() => {
                setLatitude(DEFAULT_CENTER[0]);
                setLongitude(DEFAULT_CENTER[1]);
                setMapFlyTrigger((n) => n + 1);
              }}
            >
              <MapPinIcon className="size-4" />
              Reset map
            </Button>
          </div>
          {geoError && (
            <p className="text-destructive text-sm">{geoError}</p>
          )}
          <LocationMapPicker
            latitude={position.lat}
            longitude={position.lng}
            onPositionChange={handlePositionChange}
            flyTrigger={mapFlyTrigger}
          />
          <p className="text-muted-foreground text-xs">
            Tap the map or drag the pin to fine-tune. Address updates automatically.
          </p>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="address">Full address</Label>
              {addressLoading && (
                <span className="flex items-center gap-1 text-muted-foreground text-xs">
                  <Loader2Icon className="size-3 animate-spin" />
                  Looking up…
                </span>
              )}
            </div>
            <Textarea
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="House, street, area — auto-filled from map"
              rows={4}
              className="rounded-xl border-border bg-muted/30"
            />
            {address.trim().length === 0 && (
              <p className="text-destructive text-xs">Address is required</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="landmark">Landmark (optional)</Label>
            <Input
              id="landmark"
              value={landmark}
              onChange={(e) => setLandmark(e.target.value)}
              placeholder="Near metro gate, blue building…"
              className="h-11 rounded-xl border-border bg-muted/30"
            />
          </div>
        </div>
      )}

      {currentStepLabel === "Review" && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="rounded-2xl border border-border bg-muted/20 p-4">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Order type
            </p>
            <p className="font-medium">
              {fulfillment === "delivery" ? "Delivery" : "Pickup at restaurant"}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-muted/20 p-4">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              {fulfillment === "delivery" ? "Delivery time" : "Pickup time"}
            </p>
            <p className="font-medium">
              {formatScheduleHuman(
                scheduleMode,
                scheduleMode === "scheduled"
                  ? parseDatetimeLocalValue(scheduledAtLocal)
                  : null,
              )}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-muted/20 p-4">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Contact
            </p>
            <p className="font-medium">{name}</p>
            <p className="text-muted-foreground text-sm">{phone}</p>
          </div>
          {fulfillment === "delivery" && (
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                Deliver to
              </p>
              <p className="whitespace-pre-wrap text-sm">{address}</p>
              {landmark && (
                <p className="mt-2 text-muted-foreground text-sm">
                  Landmark: {landmark}
                </p>
              )}
              {notes && (
                <p className="mt-2 text-muted-foreground text-sm">
                  Notes: {notes}
                </p>
              )}
              {latitude != null && longitude != null && (
                <p className="mt-2 text-muted-foreground text-xs tabular-nums">
                  Coordinates: {latitude.toFixed(5)}, {longitude.toFixed(5)}
                </p>
              )}
            </div>
          )}
          {fulfillment === "pickup" && notes.trim().length > 0 && (
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                Notes
              </p>
              <p className="text-sm">{notes}</p>
            </div>
          )}
          <div className="flex items-center justify-between rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3">
            <span className="font-medium">Order total</span>
            <span className="font-heading text-2xl font-bold text-primary tabular-nums">
              ₹{totalAmount}
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 pt-2">
        {step > 0 && (
          <Button
            type="button"
            variant="outline"
            className="flex-1 rounded-full border-border"
            onClick={goBack}
          >
            Back
          </Button>
        )}
        {step < maxStepIndex && (
          <Button
            type="button"
            className="bg-cta-gradient min-h-12 flex-[2] rounded-full font-semibold text-primary-foreground shadow-md shadow-cta"
            onClick={goNext}
            disabled={
              (currentStepLabel === "When & how" && !canNextFromWhenHow) ||
              (currentStepLabel === "Contact" && !canNextFromContact) ||
              (currentStepLabel === "Location" && !canNextFromLocation)
            }
          >
            Continue
          </Button>
        )}
        {step === maxStepIndex && (
          <Button
            type="button"
            className="bg-cta-gradient min-h-12 flex-[2] rounded-full font-semibold text-primary-foreground shadow-md shadow-cta"
            onClick={() => void placeOrder()}
            disabled={!settings || placingOrder}
          >
            {placingOrder ? (
              <>
                <Loader2Icon className="mr-2 size-4 animate-spin" />
                Placing order…
              </>
            ) : (
              "Place order"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

function StepperHeader({
  step,
  steps,
}: {
  step: number;
  steps: readonly string[];
}) {
  const n = steps.length;
  return (
    <div className="space-y-4">
      <div className="flex justify-between gap-2">
        {steps.map((label, i) => (
          <div
            key={label}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 text-center",
              i <= step ? "text-primary" : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-full border text-xs font-bold",
                i < step &&
                  "border-primary bg-primary text-primary-foreground",
                i === step &&
                  "border-primary bg-primary/20 text-primary shadow-[0_0_20px_rgba(185,28,28,0.35)]",
                i > step && "border-border bg-muted/30",
              )}
            >
              {i < step ? <CheckIcon className="size-4" /> : i + 1}
            </span>
            <span className="hidden text-[10px] font-medium sm:block">
              {label}
            </span>
          </div>
        ))}
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-r from-red-600 to-red-900 transition-all duration-500"
          style={{ width: `${((step + 1) / n) * 100}%` }}
        />
      </div>
    </div>
  );
}
