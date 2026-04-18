"use client";

import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
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
    </>
  );
}
