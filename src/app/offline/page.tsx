import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function OfflinePage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <h1 className="font-heading text-2xl font-semibold">You are offline</h1>
      <p className="max-w-sm text-muted-foreground text-sm">
        Cached pages may still work. Reconnect to browse the full menu.
      </p>
      <Link href="/" className={cn(buttonVariants({ size: "lg" }))}>
        Back home
      </Link>
    </div>
  );
}
