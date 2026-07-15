"use client";

import { usePathname } from "next/navigation";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMobilePos = pathname?.startsWith("/admin/pos/mobile") ?? false;

  return (
    <>
      {children}
      {!isMobilePos ? (
        <Toaster
          richColors
          position="top-center"
          toastOptions={{
            classNames: {
              toast:
                "bg-card/95 border border-border/60 text-foreground backdrop-blur-md shadow-lg",
            },
          }}
        />
      ) : null}
    </>
  );
}
