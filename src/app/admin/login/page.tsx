"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  defaultAdminHomePath,
  hasPermission,
  type AdminPermission,
  type PermissionBearer,
} from "@/lib/admin-permissions";
import { isMobileView } from "@/lib/is-mobile";
import { SITE } from "@/lib/site";

type LoginUser = {
  role: PermissionBearer["role"];
  permissions: AdminPermission[];
};

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      credentials: "include",
    });
    if (!res.ok) {
      let msg = "Sign in failed";
      try {
        const j = (await res.json()) as { error?: string };
        if (j.error) msg = j.error;
      } catch {
        /* ignore */
      }
      toast.error(msg);
      return;
    }

    let user: LoginUser | null = null;
    try {
      const j = (await res.json()) as { user?: LoginUser };
      if (j.user) user = j.user;
    } catch {
      /* ignore */
    }

    toast.success("Welcome back");

    const bearer: PermissionBearer | null = user
      ? { role: user.role, permissions: user.permissions }
      : null;
    const mobile = isMobileView();

    // Mobile view: skip the admin panel and open POS Mobile directly.
    if (mobile && bearer && hasPermission(bearer, "pos")) {
      router.push("/admin/pos/mobile");
      router.refresh();
      return;
    }

    const from = searchParams.get("from");
    if (from?.startsWith("/admin") && from !== "/admin" && from !== "/admin/") {
      router.push(from);
    } else if (bearer) {
      router.push(defaultAdminHomePath(bearer, { preferMobile: mobile }));
    } else {
      router.push("/admin/dashboard");
    }
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
              Sign in with a user from the database. Create the first super admin
              with <code className="text-xs">npm run db:seed</code> (see{" "}
              <code className="text-xs">.env.example</code>).
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11"
          />
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
