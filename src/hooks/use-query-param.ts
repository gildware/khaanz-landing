"use client";

import { useCallback, useSyncExternalStore } from "react";

const QUERY_PARAM_EVENT = "khaanz:query-param-change";

function subscribe(callback: () => void) {
  window.addEventListener("popstate", callback);
  window.addEventListener(QUERY_PARAM_EVENT, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener(QUERY_PARAM_EVENT, callback);
  };
}

function replaceSearchParam(key: string, next: string, defaultValue: string) {
  const params = new URLSearchParams(window.location.search);
  if (next === defaultValue) {
    params.delete(key);
  } else {
    params.set(key, next);
  }
  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  window.history.replaceState(window.history.state, "", url);
  window.dispatchEvent(new Event(QUERY_PARAM_EVENT));
}

/**
 * Syncs a string value with a URL query param so it survives refresh
 * (and works with back/forward). Default values are omitted from the URL.
 *
 * Uses history.replaceState (no Next navigation) and useSyncExternalStore
 * so SSR/first paint matches the default, then hydrates from the URL.
 */
export function useQueryParam(key: string, defaultValue: string) {
  const getSnapshot = useCallback(() => {
    const param = new URLSearchParams(window.location.search).get(key);
    return param ?? defaultValue;
  }, [key, defaultValue]);

  const getServerSnapshot = useCallback(() => defaultValue, [defaultValue]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setValue = useCallback(
    (next: string) => {
      replaceSearchParam(key, next, defaultValue);
    },
    [key, defaultValue],
  );

  return [value, setValue] as const;
}
