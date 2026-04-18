"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckIcon,
  Loader2Icon,
  MapPinIcon,
  NavigationIcon,
} from "lucide-react";

import { LocationMapPicker } from "@/components/map/location-map-picker";
import { DEFAULT_CENTER } from "@/lib/map-constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { reverseGeocode } from "@/lib/geocode";
import { useCartTotals } from "@/hooks/use-cart-totals";
import { useCartStore } from "@/store/cartStore";
import { openWhatsAppOrder } from "@/utils/whatsapp";
import { cn } from "@/lib/utils";

const STEPS = ["Contact", "Location", "Review"] as const;

function isValidIndianMobile(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(phone.replace(/\s/g, ""));
}

export function CheckoutForm() {
  const router = useRouter();
  const { lines, totalAmount } = useCartTotals();
  const clearCart = useCartStore((s) => s.clearCart);

  const [step, setStep] = useState(0);
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
    if (latitude != null && longitude != null && step === 1) {
      const handle = setTimeout(() => {
        void fetchAddress(latitude, longitude);
      }, 500);
      return () => clearTimeout(handle);
    }
  }, [latitude, longitude, step, fetchAddress]);

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

  const canNextFromContact =
    name.trim().length > 0 && isValidIndianMobile(phone);

  const canNextFromLocation =
    latitude != null &&
    longitude != null &&
    address.trim().length > 0;

  const goNext = () => {
    if (step === 0 && !canNextFromContact) return;
    if (step === 1 && !canNextFromLocation) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const placeOrder = () => {
    openWhatsAppOrder({
      customerName: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      landmark: landmark.trim(),
      notes: notes.trim(),
      lines,
      latitude,
      longitude,
    });
    clearCart();
    const q = new URLSearchParams({ name: name.trim() });
    router.push(`/success?${q.toString()}`);
  };

  if (lines.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-muted-foreground">
        Your cart is empty. Add items from the menu first.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <StepperHeader step={step} />

      {step === 0 && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="As on your doorbell"
              className="h-12 rounded-xl border-white/10 bg-muted/30"
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
              className="h-12 rounded-xl border-white/10 bg-muted/30"
              autoComplete="tel"
            />
            {phone.length > 0 && !isValidIndianMobile(phone) && (
              <p className="text-destructive text-xs">
                Enter a valid 10-digit Indian mobile number
              </p>
            )}
          </div>
        </div>
      )}

      {step === 1 && (
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
              className="rounded-full border-white/15"
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
            <p className="text-red-200/90 text-sm">{geoError}</p>
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
              className="rounded-xl border-white/10 bg-muted/30"
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
              className="h-11 rounded-xl border-white/10 bg-muted/30"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Delivery notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ring the bell twice, leave at reception…"
              rows={3}
              className="rounded-xl border-white/10 bg-muted/30"
            />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="rounded-2xl border border-white/10 bg-muted/20 p-4">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Contact
            </p>
            <p className="font-medium">{name}</p>
            <p className="text-muted-foreground text-sm">{phone}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-muted/20 p-4">
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
            className="flex-1 rounded-full border-white/15"
            onClick={goBack}
          >
            Back
          </Button>
        )}
        {step < STEPS.length - 1 && (
          <Button
            type="button"
            className="bg-cta-gradient min-h-12 flex-[2] rounded-full font-semibold text-white shadow-md shadow-red-950/40"
            onClick={goNext}
            disabled={
              (step === 0 && !canNextFromContact) ||
              (step === 1 && !canNextFromLocation)
            }
          >
            Continue
          </Button>
        )}
        {step === STEPS.length - 1 && (
          <Button
            type="button"
            className="bg-cta-gradient min-h-12 flex-[2] rounded-full font-semibold text-white shadow-md shadow-red-950/40"
            onClick={placeOrder}
          >
            Place order on WhatsApp
          </Button>
        )}
      </div>
    </div>
  );
}

function StepperHeader({ step }: { step: number }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between gap-2">
        {STEPS.map((label, i) => (
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
                i > step && "border-white/15 bg-muted/30",
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
          style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
        />
      </div>
    </div>
  );
}
