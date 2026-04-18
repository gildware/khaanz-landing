import { readFile } from "fs/promises";
import { join } from "path";

import { get } from "@vercel/blob";

import { invoiceBlobPathname } from "@/lib/persist-invoice-pdf";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _req: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await context.params;
  if (!UUID_RE.test(orderId)) {
    return new Response("Not found", { status: 404 });
  }

  const path = join(process.cwd(), "data", "invoices", `${orderId}.pdf`);
  const pdfHeaders = {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="invoice-${orderId}.pdf"`,
    "Cache-Control": "private, no-store",
  } as const;

  try {
    const buf = await readFile(path);
    return new Response(buf, { headers: pdfHeaders });
  } catch {
    /* On Vercel, invoices live in Blob when `BLOB_READ_WRITE_TOKEN` is set. */
  }

  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    const blob = await get(invoiceBlobPathname(orderId), { access: "public" });
    if (blob?.statusCode === 200 && blob.stream) {
      return new Response(blob.stream, { headers: pdfHeaders });
    }
  }

  return new Response("Not found", { status: 404 });
}
