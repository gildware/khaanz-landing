import { Suspense } from "react";

import { SuccessContent } from "./success-content";

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center px-6 text-muted-foreground">
          Loading…
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
