import { NextResponse } from "next/server";

import { buildMenuBoardHtml } from "@/lib/menu-board-html";
import { readMenuPayload } from "@/lib/menu-repository";

export const runtime = "nodejs";

export async function GET() {
  const payload = await readMenuPayload();
  const html = buildMenuBoardHtml(payload);

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
