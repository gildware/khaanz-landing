"use client";

import { useRef, useState } from "react";
import { FileTextIcon, ImageIcon, PaperclipIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { purchaseBillCloudinaryFolder } from "@/lib/cloudinary-folders";
import {
  MAX_PURCHASE_BILLS,
  type PurchaseBill,
} from "@/lib/inventory/purchase-bills";
import { uploadAdminFile } from "@/lib/upload-admin-image";

function isPdfUrl(url: string, fileName: string): boolean {
  const n = fileName.toLowerCase();
  return n.endsWith(".pdf") || url.includes("/raw/upload/");
}

export function PurchaseBillField({
  bills,
  onChange,
  supplierName,
  disabled,
}: {
  bills: PurchaseBill[];
  onChange: (next: PurchaseBill[]) => void;
  supplierName: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const folderHint = (supplierName ?? "").trim()
    ? purchaseBillCloudinaryFolder(supplierName)
    : "khaanz/purchase-bills/Vendor-name/bills";

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const name = supplierName.trim();
    if (!name) {
      toast.error("Select a supplier first so the bill is stored under that vendor");
      return;
    }
    const room = MAX_PURCHASE_BILLS - bills.length;
    if (room <= 0) {
      toast.error(`You can attach up to ${MAX_PURCHASE_BILLS} bills`);
      return;
    }
    const picked = Array.from(files).slice(0, room);
    setUploading(true);
    try {
      const added: PurchaseBill[] = [];
      for (const file of picked) {
        const { url, fileName } = await uploadAdminFile({
          file,
          folder: purchaseBillCloudinaryFolder(name),
          publicId: `bill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        });
        added.push({ url, fileName });
      }
      onChange([...bills, ...added]);
      toast.success(added.length === 1 ? "Bill uploaded" : `${added.length} bills uploaded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bill upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2 md:col-span-3">
      <Label>Supplier bill</Label>
      <p className="text-muted-foreground text-xs">
        Photo or PDF of the invoice. Saved in Cloudinary as{" "}
        <span className="font-medium text-foreground">{folderHint}</span>
        . Select a supplier first. You can add more than one page.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="sr-only"
          disabled={disabled || uploading || !supplierName.trim()}
          onChange={(e) => void onFiles(e.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={
            disabled ||
            uploading ||
            !supplierName.trim() ||
            bills.length >= MAX_PURCHASE_BILLS
          }
          onClick={() => inputRef.current?.click()}
        >
          <PaperclipIcon className="mr-2 size-4" aria-hidden />
          {uploading ? "Uploading…" : "Upload bill"}
        </Button>
      </div>
      {bills.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {bills.map((b) => {
            const pdf = isPdfUrl(b.url, b.fileName);
            return (
              <li
                key={b.url}
                className="flex items-start gap-2 rounded-lg border bg-card p-2"
              >
                {pdf ? (
                  <a
                    href={b.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex size-16 shrink-0 items-center justify-center rounded-md bg-muted"
                  >
                    <FileTextIcon className="size-6 text-muted-foreground" />
                  </a>
                ) : (
                  <a href={b.url} target="_blank" rel="noreferrer" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={b.url}
                      alt={b.fileName || "Bill"}
                      className="size-16 rounded-md object-cover"
                    />
                  </a>
                )}
                <div className="min-w-0 flex-1">
                  <a
                    href={b.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-sm font-medium underline-offset-2 hover:underline"
                  >
                    {b.fileName || (pdf ? "Bill PDF" : "Bill photo")}
                  </a>
                  <p className="text-muted-foreground text-xs">
                    {pdf ? "PDF" : "Photo"} · tap to open
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={disabled || uploading}
                  onClick={() => onChange(bills.filter((x) => x.url !== b.url))}
                >
                  <Trash2Icon className="size-4" aria-hidden />
                  <span className="sr-only">Remove bill</span>
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <ImageIcon className="size-3.5" aria-hidden />
          No bill attached yet
        </p>
      )}
    </div>
  );
}
