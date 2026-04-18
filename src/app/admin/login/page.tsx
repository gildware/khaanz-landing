"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SITE } from "@/lib/site";

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
      credentials: "include",
    });
    if (!res.ok) {
      toast.error("Invalid password");
      return;
    }
    toast.success("Welcome back");
    const from = searchParams.get("from") ?? "/admin/dashboard";
    router.push(from.startsWith("/admin") ? from : "/admin/dashboard");
    router.refresh();
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-muted/30 p-6">
      <form
        onSubmit={(e) => void submit(e)}
        className="w-full max-w-sm space-y-6 rounded-2xl border bg-card p-8 shadow-lg"
      >
        <div className="space-y-4">
          <div className="relative mx-auto h-14 w-48">
            <Image
              src={SITE.logoPath}
              alt={SITE.name}
              fill
              className="object-contain"
              sizes="192px"
              priority
            />
          </div>
          <div>
          <h1 className="font-semibold text-2xl">Admin login</h1>
          <p className="text-muted-foreground text-sm">
            Password is set with ADMIN_PASSWORD (see README).
          </p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pw">Password</Label>
          <Input
            id="pw"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11"
          />
        </div>
        <Button type="submit" className="w-full">
          Sign in
        </Button>
        <p className="text-muted-foreground text-center text-xs">
          Default: <code>khaanzadmin</code>
        </p>
      </form>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center p-6 text-muted-foreground text-sm">
          Loading…
        </div>
      }
    >
      <AdminLoginForm />
    </Suspense>
  );
}
