"use client";

import { useEffect, useRef } from "react";

import { loadGoogleMaps } from "@/lib/google-maps-loader";

export interface GoogleMapInnerProps {
  latitude: number;
  longitude: number;
  onPositionChange: (lat: number, lng: number) => void;
  /** Increment to pan the map (GPS / search pick). Do not tie to marker drag. */
  flyTrigger?: number;
  className?: string;
  /** Called when the Maps JS API fails to load (missing key, quota, network, etc.). */
  onLoadError?: () => void;
}

export function GoogleMapInner({
  latitude,
  longitude,
  onPositionChange,
  flyTrigger = 0,
  className,
  onLoadError,
}: GoogleMapInnerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const onChangeRef = useRef(onPositionChange);
  onChangeRef.current = onPositionChange;

  useEffect(() => {
    let cancelled = false;
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

    loadGoogleMaps(apiKey)
      .then((maps) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        const center = { lat: latitude, lng: longitude };
        const map = new maps.Map(containerRef.current, {
          center,
          zoom: 16,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: "greedy",
        });
        const marker = new maps.Marker({
          position: center,
          map,
          draggable: true,
        });
        marker.addListener("dragend", () => {
          const p = marker.getPosition();
          if (p) onChangeRef.current(p.lat(), p.lng());
        });
        map.addListener("click", (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          onChangeRef.current(e.latLng.lat(), e.latLng.lng());
        });
        mapRef.current = map;
        markerRef.current = marker;
      })
      .catch(() => {
        if (!cancelled) onLoadError?.();
      });

    return () => {
      cancelled = true;
    };
    // Only initialise once; subsequent position changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onLoadError]);

  // Keep the marker in sync when the position changes externally (search, GPS, manual edit).
  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;
    marker.setPosition({ lat: latitude, lng: longitude });
  }, [latitude, longitude]);

  // Pan/zoom only for programmatic jumps (GPS / search pick), not for marker drag.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || flyTrigger <= 0) return;
    map.panTo({ lat: latitude, lng: longitude });
    map.setZoom(16);
  }, [flyTrigger, latitude, longitude]);

  return <div ref={containerRef} className={className} />;
}
