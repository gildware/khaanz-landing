"use client";

import { useEffect } from "react";
import { Loader2Icon } from "lucide-react";

/** Redirects to the live HTML menu board (requires admin session cookie). */
export default function AdminMenuBoardPage() {
  useEffect(() => {
    window.location.replace("/api/admin/menu/board");
  }, []);

  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
      <Loader2Icon className="size-5 animate-spin" aria-hidden />
      Opening menu board…
    </div>
  );
}
