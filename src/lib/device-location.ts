export type DeviceLocationError =
  | "unsupported"
  | "permission_denied"
  | "unavailable"
  | "timeout";

export type DeviceLocationResult =
  | { ok: true; latitude: number; longitude: number }
  | { ok: false; error: DeviceLocationError };

const DEFAULT_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 60_000,
};

function mapGeolocationError(error: GeolocationPositionError): DeviceLocationError {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "permission_denied";
    case error.POSITION_UNAVAILABLE:
      return "unavailable";
    case error.TIMEOUT:
      return "timeout";
    default:
      return "unavailable";
  }
}

/** Resolves with device coordinates or a typed error (never throws). */
export function requestDeviceLocation(
  options: PositionOptions = DEFAULT_OPTIONS,
): Promise<DeviceLocationResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({ ok: false, error: "unsupported" });
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          ok: true,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      (err) => {
        resolve({ ok: false, error: mapGeolocationError(err) });
      },
      options,
    );
  });
}

export async function queryGeolocationPermission(): Promise<
  PermissionState | "unsupported"
> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return "unsupported";
  }
  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    return status.state;
  } catch {
    return "unsupported";
  }
}

export function deviceLocationErrorMessage(error: DeviceLocationError): string {
  switch (error) {
    case "unsupported":
      return "Geolocation is not supported in this browser.";
    case "permission_denied":
      return "Location access is blocked. Allow it below so we can pin your delivery address.";
    case "unavailable":
      return "Could not detect your location. Search below or tap the map to set the pin.";
    case "timeout":
      return "Location took too long. Try again or search for your area below.";
  }
}
