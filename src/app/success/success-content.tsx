"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SuccessContent() {
  const searchParams = useSearchParams();
  const name = searchParams.get("name")?.trim() ?? "";
  const orderRef = searchParams.get("ref")?.trim() ?? "";
  const orderUuid = searchParams.get("order")?.trim() ?? "";
  const notifiedOnWhatsApp = searchParams.get("sent") === "1";

  const [waHref, setWaHref] = useState<string | null>(null);

  useEffect(() => {
    setWaHref(sessionStorage.getItem("khaanz_wa_order_href"));
  }, []);

  const trackKey = orderRef || orderUuid;
  const showWhatsAppButton = !notifiedOnWhatsApp && !!waHref;

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-gradient-to-b from-background to-muted px-6 pb-12 text-center">
      <div className="flex size-20 items-center justify-center rounded-full bg-emerald-100 ring-2 ring-emerald-600/35">
        <svg
          className="size-10 text-emerald-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>
      <div className="max-w-md space-y-3">
        <h1 className="font-heading text-3xl font-bold">Order placed</h1>
        <p className="text-foreground">
          Thanks{name ? `, ${name}` : ""}! Your order is received and waiting for
          the restaurant to confirm the order.
        </p>
        {orderRef ? (
          <p className="text-muted-foreground text-sm">
            Order ID:{" "}
            <span className="font-mono text-foreground">{orderRef}</span>
          </p>
        ) : null}
        <p className="text-muted-foreground text-sm">
          {notifiedOnWhatsApp ? (
            <>
              We notified the restaurant on WhatsApp. You will get status updates
              on your number as your order progresses.
            </>
          ) : showWhatsAppButton ? (
            <>
              Tap the button below to send this order to the restaurant on
              WhatsApp so they can confirm it.
            </>
          ) : (
            <>
              Track status from your account or the link below. If WhatsApp did
              not open from this device, go to My orders for your order details.
            </>
          )}
        </p>
      </div>

      {showWhatsAppButton && waHref ? (
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            buttonVariants({ size: "lg" }),
            "rounded-full px-8 bg-[#25D366] text-white hover:bg-[#20bd5a]",
          )}
        >
          Send order on WhatsApp
        </a>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
        {trackKey ? (
          <Link
            href={`/track/${encodeURIComponent(trackKey)}`}
            className={cn(buttonVariants({ size: "lg" }), "rounded-full px-8")}
          >
            Track this order
          </Link>
        ) : null}
        <Link
          href="/my-orders"
          className={cn(
            buttonVariants({ variant: "outline", size: "lg" }),
            "rounded-full px-8",
          )}
        >
          My orders
        </Link>
        <Link
          href="/"
          className={cn(
            buttonVariants({ variant: "secondary", size: "lg" }),
            "rounded-full px-8",
          )}
        >
          Back to menu
        </Link>
      </div>
    </div>
  );
}
