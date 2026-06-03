"use client";

import dynamic from "next/dynamic";
import { Loader2Icon, NavigationIcon } from "lucide-react";


const GoogleMapInner = dynamic(
  () =>
    import("@/components/map/google-map-inner").then((m) => m.GoogleMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 w-full items-center justify-center rounded-xl border border-border/50 bg-muted/30">
        <Loader2Icon className="size-8 animate-spin text-primary" />
      </div>
    ),
  },
);

export interface LocationMapPickerProps {
  latitude: number;
  longitude: number;
  onPositionChange: (lat: number, lng: number) => void;
  flyTrigger?: number;
  onUseCurrentLocation?: () => void;
  locating?: boolean;
}

export function LocationMapPicker({
  latitude,
  longitude,
  onPositionChange,
  flyTrigger = 0,
  onUseCurrentLocation,
  locating = false,
}: LocationMapPickerProps) {
  return (
    <div className="relative rounded-xl border border-border bg-muted/20 p-1 shadow-inner">
      <GoogleMapInner
        latitude={latitude}
        longitude={longitude}
        onPositionChange={onPositionChange}
        flyTrigger={flyTrigger}
        className="h-64 w-full rounded-lg"
      />
      {onUseCurrentLocation && (
        <button
          type="button"
          onClick={onUseCurrentLocation}
          disabled={locating}
          className="absolute right-3 top-3 z-[1] inline-flex items-center gap-1.5 rounded-full border border-border bg-background/95 px-3 py-1.5 text-xs font-medium shadow-md backdrop-blur transition-colors hover:bg-background disabled:opacity-70"
        >
          {locating ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <NavigationIcon className="size-3.5" />
          )}
          Use current location
        </button>
      )}
    </div>
  );
}
