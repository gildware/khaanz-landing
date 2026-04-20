"use client";

import { useEffect } from "react";

function isIOSDevice(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  if (
    window.navigator.platform === "MacIntel" &&
    window.navigator.maxTouchPoints > 1
  ) {
    return true;
  }
  return false;
}

function formatRuntimeErrorAlert(
  message: string,
  source: string | undefined,
  line: number | undefined,
  column: number | undefined,
  stack: string | undefined,
): string {
  const file = source ?? "(unknown)";
  const lineCol =
    line != null && column != null
      ? `${line}:${column}`
      : line != null
        ? String(line)
        : "(unknown)";
  const stackBlock = stack?.trim() ? `\n\n${stack.trim()}` : "";
  return `ERROR: ${message}\nFILE: ${file}\nLINE: ${lineCol}${stackBlock}`;
}

function formatPromiseRejectionAlert(reason: unknown): string {
  let message: string;
  let stack: string | undefined;

  if (reason instanceof Error) {
    message = reason.message;
    stack = reason.stack;
  } else if (typeof reason === "string") {
    message = reason;
  } else {
    try {
      message = JSON.stringify(reason);
    } catch {
      message = String(reason);
    }
  }

  const stackBlock = stack?.trim() ? `\n\n${stack.trim()}` : "";
  return `PROMISE ERROR: ${message}${stackBlock}`;
}

/**
 * Production-only on iPhone/iPad: surfaces uncaught errors via `alert`.
 * Eruda is intentionally not loaded: it is heavy and commonly crashes mobile WebKit tabs.
 */
export function IOSProductionDebug() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV !== "production") return;
    if (!isIOSDevice()) return;

    const prevOnError = window.onerror;
    const prevOnUnhandledRejection = window.onunhandledrejection;

    window.onerror = (
      message: string | Event,
      source?: string,
      lineno?: number,
      colno?: number,
      error?: Error,
    ): boolean => {
      const msg =
        typeof message === "string"
          ? message
          : "Unknown error (non-string message)";
      const stack = error?.stack;
      alert(formatRuntimeErrorAlert(msg, source, lineno, colno, stack));

      if (typeof prevOnError === "function") {
        const handled = prevOnError.call(
          window,
          message,
          source,
          lineno,
          colno,
          error,
        );
        return Boolean(handled);
      }
      return false;
    };

    window.onunhandledrejection = (event: PromiseRejectionEvent) => {
      alert(formatPromiseRejectionAlert(event.reason));
      if (typeof prevOnUnhandledRejection === "function") {
        prevOnUnhandledRejection.call(window, event);
      }
    };

    return () => {
      window.onerror = prevOnError;
      window.onunhandledrejection = prevOnUnhandledRejection;
    };
  }, []);

  return null;
}
