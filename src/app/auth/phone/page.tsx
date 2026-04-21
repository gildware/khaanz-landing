"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  const sendOtp = async () => {
    const digits = phone.replace(/\D/g, "").slice(0, 10);
    if (!/^[6-9]\d{9}$/.test(digits)) {
      toast.error("Enter a valid 10-digit Indian mobile number.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: digits }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        devOtp?: string;
      };
      if (!res.ok) {
        toast.error(j.error ?? "Could not send code.");
        return;
      }
      if (j.devOtp) {
        toast.success(`Development OTP: ${j.devOtp}`, { duration: 20_000 });
      } else {
        toast.success("Check WhatsApp for your code.");
      }
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
      router.push(safeNext);
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
            Use your mobile number. We send a one-time code on WhatsApp when
            configured, or show a dev code locally.
          </p>
        </div>

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
