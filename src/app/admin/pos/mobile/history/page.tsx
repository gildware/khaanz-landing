"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ArrowLeftIcon } from "lucide-react";

import { PosMobileOrderHistory } from "@/components/admin/pos-mobile-order-history";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Legacy route — redirects into the POS Orders tab. */
export default function AdminPosMobileHistoryPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/pos/mobile?tab=orders");
  }, [router]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b bg-background px-3 pb-2.5 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2">
          <Link
            href="/admin/pos/mobile"
            aria-label="Back to POS"
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon" }),
              "size-10 shrink-0",
            )}
          >
            <ArrowLeftIcon className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-semibold text-base leading-tight">
              Order history
            </h1>
            <p className="text-muted-foreground text-[11px]">Opening Orders…</p>
          </div>
        </div>
      </header>
      <PosMobileOrderHistory />
    </div>
  );
}
