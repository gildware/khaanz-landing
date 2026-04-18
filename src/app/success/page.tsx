import Link from "next/link";

import { InvoicePdfLink } from "@/components/InvoicePdfLink";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  searchParams: Promise<{ name?: string; order?: string; sent?: string }>;
};

export default async function SuccessPage({ searchParams }: Props) {
  const { name, order, sent } = await searchParams;
  const pdfSentToKitchen = sent === "1";

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
      <div className="max-w-md space-y-2">
        <h1 className="font-heading text-3xl font-bold">Order sent</h1>
        <p className="text-muted-foreground">
          Thanks{name ? `, ${name}` : ""}!
          {pdfSentToKitchen ? (
            <>
              {" "}
              Your invoice PDF was sent to the restaurant on WhatsApp. They will
              confirm shortly.
            </>
          ) : (
            <>
              {" "}
              {order
                ? "We opened WhatsApp with your order text. The kitchen may not have received a PDF automatically—download your invoice below if you need a copy."
                : "WhatsApp should open with your order details. The restaurant will confirm shortly."}
            </>
          )}
        </p>
        {order && (
          <p className="pt-2">
            <InvoicePdfLink orderId={order}>Download invoice (PDF)</InvoicePdfLink>
          </p>
        )}
      </div>
      <Link
        href="/"
        className={cn(buttonVariants({ size: "lg" }), "rounded-full px-8")}
      >
        Back to menu
      </Link>
    </div>
  );
}
