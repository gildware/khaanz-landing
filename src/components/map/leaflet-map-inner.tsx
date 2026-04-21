"use client";

import { useCallback, useEffect, useMemo } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

function fixLeafletIcons() {
  const proto = L.Icon.Default.prototype as unknown as {
    _getIconUrl?: () => string;
  };
  delete proto._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
    iconUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
    shadowUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  });
}

function MapEvents({
  onPositionChange,
}: {
  onPositionChange: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onPositionChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/** Call with `flyTrigger` incremented only for programmatic jumps (e.g. GPS), not marker drag */
function FlyToWhenTriggered({
  lat,
  lng,
  flyTrigger,
}: {
  lat: number;
  lng: number;
  flyTrigger: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (flyTrigger <= 0) return;
    map.invalidateSize();
    map.flyTo([lat, lng], 16, {
      duration: 0.55,
      animate: true,
    });
  }, [flyTrigger, lat, lng, map]);
  return null;
}

export interface LeafletMapInnerProps {
  latitude: number;
  longitude: number;
  onPositionChange: (lat: number, lng: number) => void;
  /** Increment to pan the map (GPS / reset). Do not tie to marker drag. */
  flyTrigger?: number;
  className?: string;
}

export function LeafletMapInner({
  latitude,
  longitude,
  onPositionChange,
  flyTrigger = 0,
  className,
}: LeafletMapInnerProps) {
  useEffect(() => {
    fixLeafletIcons();
  }, []);

  const position: [number, number] = useMemo(
    () => [latitude, longitude],
    [latitude, longitude],
  );

  const handleDragEnd = useCallback(
    (e: { target: L.Marker }) => {
      const p = e.target.getLatLng();
      onPositionChange(p.lat, p.lng);
    },
    [onPositionChange],
  );

  return (
    <MapContainer
      center={position}
      zoom={16}
      className={className ?? "h-64 w-full rounded-xl z-0"}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker
        position={position}
        draggable
        eventHandlers={{ dragend: handleDragEnd }}
      />
      <MapEvents onPositionChange={onPositionChange} />
      <FlyToWhenTriggered
        lat={latitude}
        lng={longitude}
        flyTrigger={flyTrigger}
      />
    </MapContainer>
  );
}
