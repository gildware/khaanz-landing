declare global {
  interface Window {
    google?: typeof google;
    __khaanzGoogleMapsReady?: () => void;
  }
}

const CALLBACK_NAME = "__khaanzGoogleMapsReady";

let loaderPromise: Promise<typeof google.maps> | null = null;

/** Loads the Google Maps JS API once and resolves with the `google.maps` namespace. */
export function loadGoogleMaps(apiKey: string): Promise<typeof google.maps> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps can only load in the browser"));
  }
  if (window.google?.maps) {
    return Promise.resolve(window.google.maps);
  }
  if (loaderPromise) {
    return loaderPromise;
  }
  if (!apiKey) {
    return Promise.reject(new Error("Missing Google Maps API key"));
  }

  loaderPromise = new Promise<typeof google.maps>((resolve, reject) => {
    window[CALLBACK_NAME] = () => {
      if (window.google?.maps) {
        resolve(window.google.maps);
      } else {
        loaderPromise = null;
        reject(new Error("Google Maps failed to initialize"));
      }
    };

    const script = document.createElement("script");
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      `&loading=async&callback=${CALLBACK_NAME}`;
    script.async = true;
    script.onerror = () => {
      loaderPromise = null;
      reject(new Error("Google Maps script failed to load"));
    };
    document.head.appendChild(script);
  });

  return loaderPromise;
}

export {};
