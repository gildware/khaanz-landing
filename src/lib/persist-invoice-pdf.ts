import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

import { put } from "@vercel/blob";

const INVOICES_DIR = join(process.cwd(), "data", "invoices");

/** Path inside the Vercel Blob store (must match GET handler). */
export function invoiceBlobPathname(orderId: string): string {
  return `invoices/${orderId}.pdf`;
}

function blobStorageConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

/**
 * Saves the invoice PDF. On Vercel/serverless the project filesystem is not
 * writable — use Vercel Blob (set `BLOB_READ_WRITE_TOKEN` in the project).
 * Locally, files go to `data/invoices/` as before.
 */
export async function persistInvoicePdf(
  orderId: string,
  pdfBytes: Uint8Array,
): Promise<void> {
  if (blobStorageConfigured()) {
    await put(invoiceBlobPathname(orderId), Buffer.from(pdfBytes), {
      access: "public",
      contentType: "application/pdf",
    });
    return;
  }

  await mkdir(INVOICES_DIR, { recursive: true });
  await writeFile(
    join(INVOICES_DIR, `${orderId}.pdf`),
    Buffer.from(pdfBytes),
  );
}
