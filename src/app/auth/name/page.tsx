"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { SITE } from "@/lib/site";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function NameForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [meReady, setMeReady] = useState(false);

  const trimmed = useMemo(() => name.trim(), [name]);

  useEffect(() => {
    setMeReady(false);
    void fetch("/api/customer/me", { credentials: "include" })
      .then(
        (r) =>
          r.json() as Promise<{
            loggedIn?: boolean;
            displayName?: string | null;
          }>,
      )
      .then((d) => {
        if (!d.loggedIn) {
          router.replace(`/auth/phone?next=${encodeURIComponent("/auth/name?next=" + safeNext)}`);
          return;
        }
        const dn = (d.displayName ?? "").trim();
        if (dn.length > 0) {
          router.replace(safeNext);
          router.refresh();
          return;
        }
        setMeReady(true);
      })
      .catch(() => {
        router.replace(`/auth/phone?next=${encodeURIComponent("/auth/name?next=" + safeNext)}`);
      });
  }, [router, safeNext]);

  const save = async () => {
    const displayName = trimmed;
    if (displayName.length < 2) {
      toast.error("Please enter your full name.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/customer/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ displayName }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(j.error ?? "Could not save name.");
        return;
      }
      toast.success("Saved your name.");
      router.push(safeNext);
      router.refresh();
    } catch {
      toast.error("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border bg-card p-8 shadow-lg">
        <div className="relative mx-auto h-12 w-40">
          <Image
            src={SITE.logoPath}
            alt={SITE.name}
            fill
            className="object-contain"
            sizes="160px"
            priority
          />
        </div>

        <div>
          <h1 className="font-semibold text-2xl">Your name</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            We’ll use this on your orders so you don’t need to retype it.
          </p>
        </div>

        {!meReady ? (
          <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
            <Loader2Icon className="size-4 animate-spin" />
            Checking account…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="As on your doorbell"
                className="h-11 rounded-xl border-border bg-muted/30"
                autoComplete="name"
              />
            </div>

            <Button
              type="button"
              className="w-full"
              disabled={busy || trimmed.length < 2}
              onClick={() => void save()}
            >
              {busy ? (
                <>
                  <Loader2Icon className="mr-2 size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save & continue"
              )}
            </Button>
          </div>
        )}

        <Link
          href={safeNext}
          className={cn(
            buttonVariants({ variant: "link" }),
            "block w-full text-center text-muted-foreground",
          )}
        >
          Skip for now
        </Link>
      </div>
    </div>
  );
}

export default function NamePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center text-muted-foreground text-sm">
          Loading…
        </div>
      }
    >
      <NameForm />
    </Suspense>
  );
}

