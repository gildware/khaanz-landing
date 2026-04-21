"use client";

import dynamic from "next/dynamic";
import { Loader2Icon } from "lucide-react";


const LeafletMapInner = dynamic(
  () =>
    import("@/components/map/leaflet-map-inner").then((m) => m.LeafletMapInner),
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
}

export function LocationMapPicker({
  latitude,
  longitude,
  onPositionChange,
  flyTrigger = 0,
}: LocationMapPickerProps) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-1 shadow-inner">
      <LeafletMapInner
        latitude={latitude}
        longitude={longitude}
        onPositionChange={onPositionChange}
        flyTrigger={flyTrigger}
        className="h-64 w-full rounded-lg z-0 [&_.leaflet-container]:rounded-lg"
      />
    </div>
  );
}
