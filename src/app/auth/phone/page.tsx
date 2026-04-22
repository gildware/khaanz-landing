"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import type { ConfirmationResult, RecaptchaVerifier } from "firebase/auth";
import { signInWithPhoneNumber } from "firebase/auth";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getFirebaseAuth, isFirebasePhoneAuthEnabled } from "@/lib/firebase-client";
import { SITE } from "@/lib/site";
import { cn } from "@/lib/utils";

function PhoneAuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const firebaseEnabled = useMemo(() => isFirebasePhoneAuthEnabled(), []);
  const auth = useMemo(() => (firebaseEnabled ? getFirebaseAuth() : null), [firebaseEnabled]);
  const recaptchaContainerId = "firebase-recaptcha-container";
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const confirmRef = useRef<ConfirmationResult | null>(null);

  useEffect(() => {
    if (!firebaseEnabled || !auth) return;
    if (typeof window === "undefined") return;

    let cancelled = false;
    (async () => {
      try {
        const mod = await import("firebase/auth");
        if (cancelled) return;
        if (recaptchaRef.current) return;
        recaptchaRef.current = new mod.RecaptchaVerifier(auth, recaptchaContainerId, {
          size: "invisible",
        });
        // Prime it so the first send is fast.
        await recaptchaRef.current.render();
      } catch (e) {
        // Firebase throws helpful messages here (e.g. CSP blocked script, domain not authorized, etc.)
        const msg =
          e instanceof Error
            ? e.message
            : typeof e === "string"
              ? e
              : "Unknown error";
        console.error("Firebase reCAPTCHA init failed:", e);
        toast.error(`Could not initialize reCAPTCHA: ${msg}`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [firebaseEnabled, auth]);

  const sendOtp = async () => {
    const digits = phone.replace(/\D/g, "").slice(0, 10);
    if (!/^[6-9]\d{9}$/.test(digits)) {
      toast.error("Enter a valid 10-digit Indian mobile number.");
      return;
    }
    setBusy(true);
    try {
      if (firebaseEnabled && auth) {
        if (!recaptchaRef.current) {
          toast.error("reCAPTCHA is not ready. Please try again.");
          return;
        }
        const e164 = `+91${digits}`;
        try {
          // Force reCAPTCHA to run now so we can fail fast with a clearer signal
          // if the verifier is blocked/misconfigured.
          const token = await recaptchaRef.current.verify();
          console.info("reCAPTCHA token acquired:", token ? `${token.length} chars` : "empty");

          confirmRef.current = await signInWithPhoneNumber(
            auth,
            e164,
            recaptchaRef.current,
          );
          toast.success("SMS code sent.");
          setPhone(digits);
          setStep("code");
          return;
        } catch (e) {
          const anyErr = e as unknown as { code?: unknown; message?: unknown };
          const code =
            anyErr && typeof anyErr === "object" && typeof anyErr.code === "string"
              ? anyErr.code
              : null;
          const msg =
            anyErr && typeof anyErr === "object" && typeof anyErr.message === "string"
              ? anyErr.message
              : null;
          console.error("Firebase signInWithPhoneNumber failed:", e);
          try {
            recaptchaRef.current.reset();
          } catch {
            // ignore reset failures
          }
          toast.error(
            code
              ? `Could not send SMS (${code}).`
              : msg
                ? `Could not send SMS: ${msg}`
                : "Could not send SMS.",
          );
          return;
        }
      }

      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: digits }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; devOtp?: string };
      if (!res.ok) {
        toast.error(j.error ?? "Could not send code.");
        return;
      }
      if (j.devOtp) toast.success(`Development OTP: ${j.devOtp}`, { duration: 20_000 });
      else toast.success("Check WhatsApp for your code.");
      setPhone(digits);
      setStep("code");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    const digits = phone.replace(/\D/g, "").slice(0, 10);
    if (!/^\d{6}$/.test(code.trim())) {
      toast.error("Enter the 6-digit code.");
      return;
    }
    setBusy(true);
    try {
      if (firebaseEnabled && auth) {
        const c = confirmRef.current;
        if (!c) {
          toast.error("Please request a code again.");
          setStep("phone");
          return;
        }
        const cred = await c.confirm(code.trim());
        const idToken = await cred.user.getIdToken();

        const res = await fetch("/api/auth/firebase/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ idToken }),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          toast.error(j.error ?? "Could not verify.");
          return;
        }
        toast.success("You are signed in.");
        const me = await fetch("/api/customer/me", { credentials: "include" })
          .then((r) => r.json() as Promise<{ loggedIn?: boolean; displayName?: string | null }>)
          .catch(() => null);
        const dn = (me && me.loggedIn ? (me.displayName ?? "") : "").trim();
        router.push(dn.length > 0 ? safeNext : `/auth/name?next=${encodeURIComponent(safeNext)}`);
        router.refresh();
        return;
      }

      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone: digits, code: code.trim() }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(j.error ?? "Could not verify.");
        return;
      }
      toast.success("You are signed in.");
      const me = await fetch("/api/customer/me", { credentials: "include" })
        .then((r) => r.json() as Promise<{ loggedIn?: boolean; displayName?: string | null }>)
        .catch(() => null);
      const dn = (me && me.loggedIn ? (me.displayName ?? "") : "").trim();
      router.push(dn.length > 0 ? safeNext : `/auth/name?next=${encodeURIComponent(safeNext)}`);
      router.refresh();
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
          <h1 className="font-semibold text-2xl">Sign in</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Use your mobile number. We will send a one-time code via{" "}
            {firebaseEnabled
              ? "SMS (Firebase)."
              : "WhatsApp when configured, or show a dev code locally."}
          </p>
        </div>

        <div id={recaptchaContainerId} />

        {step === "phone" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Mobile number</Label>
              <Input
                id="phone"
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={(e) =>
                  setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                }
                placeholder="10-digit number"
                className="h-11 font-mono"
                autoComplete="tel-national"
              />
            </div>
            <Button
              type="button"
              className="w-full"
              disabled={busy}
              onClick={() => void sendOtp()}
            >
              {busy ? (
                <>
                  <Loader2Icon className="mr-2 size-4 animate-spin" />
                  Sending…
                </>
              ) : (
                "Send code"
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Code sent to <span className="font-mono text-foreground">{phone}</span>
            </p>
            <div className="space-y-2">
              <Label htmlFor="code">6-digit code</Label>
              <Input
                id="code"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="000000"
                className="h-11 font-mono tracking-widest"
                autoComplete="one-time-code"
              />
            </div>
            <Button
              type="button"
              className="w-full"
              disabled={busy}
              onClick={() => void verify()}
            >
              {busy ? (
                <>
                  <Loader2Icon className="mr-2 size-4 animate-spin" />
                  Verifying…
                </>
              ) : (
                "Verify & continue"
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={busy}
              onClick={() => {
                setStep("phone");
                setCode("");
                confirmRef.current = null;
              }}
            >
              Use a different number
            </Button>
          </div>
        )}

        <Link
          href="/"
          className={cn(
            buttonVariants({ variant: "link" }),
            "block w-full text-center text-muted-foreground",
          )}
        >
          Back to menu
        </Link>
      </div>
    </div>
  );
}

export default function PhoneAuthPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center text-muted-foreground text-sm">
          Loading…
        </div>
      }
    >
      <PhoneAuthForm />
    </Suspense>
  );
}
