"use client";

import { useEffect, useMemo, useState } from "react";
import { DownloadIcon, ExternalLinkIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  detectDesktopPosClientOs,
  getDesktopPosDownloadUrls,
  type DesktopPosClientOs,
} from "@/lib/desktop-pos-download-config";
import { cn } from "@/lib/utils";

function osLabel(os: DesktopPosClientOs): string {
  if (os === "mac") return "macOS";
  if (os === "windows") return "Windows";
  if (os === "linux") return "Linux";
  return "Unknown OS";
}

export function DesktopPosDownloadCard() {
  const [os, setOs] = useState<DesktopPosClientOs>("unknown");
  useEffect(() => {
    setOs(detectDesktopPosClientOs());
  }, []);

  const { mac, windows } = getDesktopPosDownloadUrls();
  const hasMac = Boolean(mac);
  const hasWin = Boolean(windows);
  const hasAny = hasMac || hasWin;

  const layout = useMemo(() => {
    if (!hasAny) return { primary: null as null | "mac" | "win", showOther: false };
    if (hasMac && !hasWin) return { primary: "mac" as const, showOther: false };
    if (!hasMac && hasWin) return { primary: "win" as const, showOther: false };
    if (os === "mac") return { primary: "mac" as const, showOther: true };
    if (os === "windows") return { primary: "win" as const, showOther: true };
    return { primary: null, showOther: false };
  }, [hasAny, hasMac, hasWin, os]);

  const primaryHref = layout.primary === "mac" ? mac : layout.primary === "win" ? windows : "";
  const primaryLabel =
    layout.primary === "mac"
      ? "Download for macOS"
      : layout.primary === "win"
        ? "Download for Windows"
        : "";
  const otherHref = layout.primary === "mac" ? windows : mac;
  const otherLabel = layout.primary === "mac" ? "Windows installer" : "macOS installer";

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div>
        <p className="font-medium">Khaanz Desktop POS</p>
        <p className="text-muted-foreground text-xs">
          Standalone app for the register: silent receipt printing and offline
          order queue. After install, set{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
            KHAANZ_APP_URL
          </code>{" "}
          to this site&apos;s origin.
        </p>
      </div>

      {!hasAny ? (
        <p className="text-muted-foreground text-sm">
          Add installer URLs to your deployment environment:{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            NEXT_PUBLIC_DESKTOP_POS_MAC_URL
          </code>{" "}
          and{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            NEXT_PUBLIC_DESKTOP_POS_WINDOWS_URL
          </code>{" "}
          (e.g. <code className="text-xs">.dmg</code> and <code className="text-xs">.exe</code>{" "}
          from <code className="text-xs">desktop-pos/release</code>).
        </p>
      ) : (
        <>
          <p className="text-muted-foreground text-xs">
            This browser:{" "}
            <span className="font-medium text-foreground">{osLabel(os)}</span>
            {layout.primary && os !== "mac" && os !== "windows" && os !== "linux"
              ? " — choose the installer for your computer."
              : null}
            {os === "linux"
              ? " — pick macOS or Windows depending on what you use (or a VM)."
              : null}
          </p>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {layout.primary ? (
              <a
                href={primaryHref}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  buttonVariants({ size: "default" }),
                  "inline-flex w-full shrink-0 gap-2 sm:w-auto",
                )}
              >
                <DownloadIcon className="size-4 shrink-0" aria-hidden />
                {primaryLabel}
                <ExternalLinkIcon className="size-3.5 shrink-0 opacity-70" aria-hidden />
              </a>
            ) : (
              <>
                {hasMac ? (
                  <a
                    href={mac}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      buttonVariants({ size: "default" }),
                      "inline-flex w-full shrink-0 gap-2 sm:w-auto",
                    )}
                  >
                    <DownloadIcon className="size-4 shrink-0" aria-hidden />
                    macOS installer
                    <ExternalLinkIcon
                      className="size-3.5 shrink-0 opacity-70"
                      aria-hidden
                    />
                  </a>
                ) : null}
                {hasWin ? (
                  <a
                    href={windows}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      buttonVariants({ variant: "outline", size: "default" }),
                      "inline-flex w-full shrink-0 gap-2 sm:w-auto",
                    )}
                  >
                    <DownloadIcon className="size-4 shrink-0" aria-hidden />
                    Windows installer
                    <ExternalLinkIcon
                      className="size-3.5 shrink-0 opacity-70"
                      aria-hidden
                    />
                  </a>
                ) : null}
              </>
            )}

            {layout.primary && layout.showOther ? (
              <a
                href={otherHref}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  buttonVariants({ variant: "outline", size: "default" }),
                  "inline-flex w-full shrink-0 gap-2 sm:w-auto",
                )}
              >
                <DownloadIcon className="size-4 shrink-0" aria-hidden />
                {otherLabel}
                <ExternalLinkIcon className="size-3.5 shrink-0 opacity-70" aria-hidden />
              </a>
            ) : null}
          </div>

          <p className="text-muted-foreground text-xs">
            Dev: <code className="rounded bg-muted px-1 py-0.5">npm run desktop</code> ·
            Ship:{" "}
            <code className="rounded bg-muted px-1 py-0.5">desktop-pos/npm run dist</code>
          </p>
        </>
      )}

      {hasAny ? (
        <a
          href="/admin/pos"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary text-xs underline underline-offset-4 hover:no-underline"
        >
          Open web POS in new tab
        </a>
      ) : null}
    </div>
  );
}
