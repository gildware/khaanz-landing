"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClockIcon,
  CheckIcon,
  Loader2Icon,
  NavigationIcon,
  PackageIcon,
  TruckIcon,
  ZapIcon,
} from "lucide-react";
import { toast } from "sonner";

import { LocationMapPicker } from "@/components/map/location-map-picker";
import { LocationSearch } from "@/components/map/location-search";
import { DEFAULT_CENTER } from "@/lib/map-constants";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { reverseGeocode, type GeocodeSearchHit } from "@/lib/geocode";
import { useRestaurantSettings } from "@/contexts/restaurant-settings-context";
import {
  formatRangeLabel,
  isChannelOpenAt,
  isDeliveryOpen,
  isPickupOpen,
} from "@/lib/restaurant-hours";
import { useCartTotals } from "@/hooks/use-cart-totals";
import { useCartStore } from "@/store/cartStore";
import { buildWaMeUrl, buildWhatsAppMessage } from "@/utils/whatsapp";
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
import {
  isIndianMobile10,
  normalizeIndianMobileDigits,
} from "@/lib/phone-digits";
import { cn } from "@/lib/utils";

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
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const [mapFlyTrigger, setMapFlyTrigger] = useState(0);
  const didAutoLocateOnLocationStepRef = useRef(false);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("asap");
  const [placingOrder, setPlacingOrder] = useState(false);
  const [scheduledAtLocal, setScheduledAtLocal] = useState("");
  /** `datetime-local` min/max must not SSR with Node's TZ — iPhone TZ differs → hydration mismatch. */
  const [clientScheduleReady, setClientScheduleReady] = useState(false);
  const [customerMe, setCustomerMe] = useState<
    | null
    | { loggedIn: false }
    | { loggedIn: true; phoneDigits: string; displayName: string | null }
  >(null);

  const phoneDigits = useMemo(
    () => normalizeIndianMobileDigits(phone),
    [phone],
  );

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

  const locateFromGps = useCallback(() => {
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
        setGeoError(
          "Could not use device location. Search below, or tap the map to set the pin.",
        );
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }, []);

  useEffect(() => {
    if (fulfillment === "pickup") {
      didAutoLocateOnLocationStepRef.current = false;
    }
  }, [fulfillment]);

  useEffect(() => {
    if (currentStepLabel !== "Location") return;
    if (didAutoLocateOnLocationStepRef.current) return;
    didAutoLocateOnLocationStepRef.current = true;
    locateFromGps();
  }, [currentStepLabel, locateFromGps]);

  const handlePositionChange = (lat: number, lng: number) => {
    setLatitude(lat);
    setLongitude(lng);
  };

  const handleSearchPick = (hit: GeocodeSearchHit) => {
    setLatitude(hit.lat);
    setLongitude(hit.lon);
    setAddress(hit.displayName);
    setMapFlyTrigger((n) => n + 1);
    setGeoError(null);
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

  const scheduleChannel: "pickup" | "delivery" =
    fulfillment === "pickup" ? "pickup" : "delivery";

  const scheduledSlotOutsideChannelHours = useMemo(() => {
    if (scheduleMode !== "scheduled" || !settings || !scheduleOk) return false;
    const d = parseDatetimeLocalValue(scheduledAtLocal);
    if (!d) return false;
    return !isChannelOpenAt(settings, scheduleChannel, d);
  }, [scheduleMode, settings, scheduleOk, scheduledAtLocal, scheduleChannel]);

  const canNextFromWhenHow = useMemo(() => {
    if (settingsLoading || !settings || !scheduleOk) return false;
    if (scheduleMode === "asap") return channelOpen;
    const d = parseDatetimeLocalValue(scheduledAtLocal);
    if (!d) return false;
    return isChannelOpenAt(settings, scheduleChannel, d);
  }, [
    settingsLoading,
    settings,
    scheduleOk,
    scheduleMode,
    scheduledAtLocal,
    channelOpen,
    scheduleChannel,
  ]);

  const phoneOk = isIndianMobile10(phoneDigits);
  const accountReady =
    customerMe !== null &&
    customerMe.loggedIn &&
    customerMe.phoneDigits === phoneDigits;
  const canNextFromContact =
    name.trim().length > 0 && phoneOk && accountReady;

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

  useEffect(() => {
    setClientScheduleReady(true);
  }, []);

  useEffect(() => {
    void fetch("/api/customer/me", { credentials: "include" })
      .then((r) => r.json() as Promise<{ loggedIn: boolean; phoneDigits?: string; displayName?: string | null }>)
      .then((d) => {
        if (d.loggedIn && d.phoneDigits) {
          setCustomerMe({
            loggedIn: true,
            phoneDigits: d.phoneDigits,
            displayName: d.displayName ?? null,
          });
          setPhone((p) => (p.length === 0 ? d.phoneDigits! : p));
        } else {
          setCustomerMe({ loggedIn: false });
        }
      })
      .catch(() => setCustomerMe({ loggedIn: false }));
  }, []);

  const placeOrder = async () => {
    if (!settings) return;
    if (!customerMe?.loggedIn) {
      toast.error("Please sign in with your phone before placing an order.");
      return;
    }
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

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
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
        if (res.status === 401) {
          toast.error("Please sign in again to place your order.");
          return;
        }
        if (res.status === 403) {
          toast.error(
            errMsg ??
              "Phone number must match your signed-in account.",
          );
          return;
        }
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

      const orderRef =
        data &&
        typeof data === "object" &&
        "orderRef" in data &&
        typeof (data as { orderRef: unknown }).orderRef === "string"
          ? (data as { orderRef: string }).orderRef
          : null;

      if (!orderId) {
        toast.error("Invalid response from server.");
        return;
      }

      clearCart();

      if (!messageSentViaWhatsApp && orderRef) {
        const waText = buildWhatsAppMessage(
          {
            orderRef,
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
        );
        const { href, truncated } = buildWaMeUrl(
          waText,
          settings.whatsappPhoneE164,
        );
        if (truncated) {
          toast.success(
            "Full order was received — WhatsApp text is shortened to fit.",
          );
        }
        sessionStorage.setItem("khaanz_wa_order_href", href);
      } else {
        sessionStorage.removeItem("khaanz_wa_order_href");
      }

      const q = new URLSearchParams();
      q.set("name", name.trim());
      if (orderRef) q.set("ref", orderRef);
      q.set("order", orderId);
      q.set("sent", messageSentViaWhatsApp ? "1" : "0");
      toast.success("Order placed!");
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
                  min={clientScheduleReady ? minScheduleLocal : undefined}
                  max={clientScheduleReady ? maxScheduleLocal : undefined}
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
                {scheduledSlotOutsideChannelHours && settings && (
                  <p className="text-destructive text-xs">
                    Choose a time inside{" "}
                    {scheduleChannel === "delivery" ? "delivery" : "pickup"}{" "}
                    hours ({formatRangeLabel(scheduleChannel === "delivery" ? settings.delivery : settings.pickup)}{" "}
                    IST).
                  </p>
                )}
              </div>
            )}
          </div>

          {!settingsLoading && settings && bothClosed && scheduleMode === "asap" && (
            <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-100 text-sm">
              We are not accepting pickup or delivery orders right now (outside
              hours). Please try again when we are open.
            </p>
          )}
          {!settingsLoading &&
            settings &&
            !bothClosed &&
            !channelOpen &&
            scheduleMode === "asap" && (
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
          {customerMe === null && (
            <p className="text-muted-foreground text-sm">Checking your account…</p>
          )}
          {customerMe !== null && !customerMe.loggedIn && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
              <p className="font-medium text-amber-950 dark:text-amber-100">
                Sign in with your phone to place an order
              </p>
              <p className="mt-1 text-muted-foreground">
                We send a one-time code to your mobile. No password.
              </p>
              <Link
                href="/auth/phone?next=/checkout"
                className={cn(
                  buttonVariants({ variant: "secondary" }),
                  "mt-3 inline-flex rounded-full",
                )}
              >
                Sign in with OTP
              </Link>
            </div>
          )}
          {customerMe?.loggedIn && (
            <p className="text-muted-foreground text-sm">
              Signed in as{" "}
              <span className="font-mono font-medium text-foreground">
                {customerMe.phoneDigits}
              </span>
              . Phone on this order must match.
            </p>
          )}
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
              readOnly={!!customerMe?.loggedIn}
              onChange={(e) =>
                setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
              }
              placeholder="10-digit mobile"
              className="h-12 rounded-xl border-border bg-muted/30 read-only:opacity-80"
              autoComplete="tel"
            />
            {phone.length > 0 && !phoneOk && (
              <p className="text-destructive text-xs">
                Enter a valid 10-digit Indian mobile number
              </p>
            )}
            {customerMe?.loggedIn && phoneOk && customerMe.phoneDigits !== phoneDigits && (
              <p className="text-destructive text-xs">
                Phone must match your signed-in number ({customerMe.phoneDigits}).
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
              onClick={() => locateFromGps()}
              disabled={geoLoading}
            >
              {geoLoading ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <NavigationIcon className="size-4" />
              )}
              Use current location
            </Button>
          </div>
          {geoError && (
            <p className="text-destructive text-sm">{geoError}</p>
          )}
          <LocationSearch onPick={handleSearchPick} disabled={geoLoading} />
          <LocationMapPicker
            latitude={position.lat}
            longitude={position.lng}
            onPositionChange={handlePositionChange}
            flyTrigger={mapFlyTrigger}
          />
          <p className="text-muted-foreground text-xs">
            Search above, or tap the map and drag the pin to fine-tune. Address updates
            automatically.
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
          {!customerMe?.loggedIn && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
              <p className="font-medium">Sign in required</p>
              <Link
                href="/auth/phone?next=/checkout"
                className={cn(
                  buttonVariants({ variant: "default", size: "sm" }),
                  "mt-2 inline-flex rounded-full",
                )}
              >
                Sign in with OTP
              </Link>
            </div>
          )}
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
            disabled={!settings || placingOrder || !customerMe?.loggedIn}
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
