import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import {
  uploadFileToCloudinary,
  uploadMenuImageToCloudinary,
} from "@/lib/cloudinary";
import {
  CLOUDINARY_FOLDER_CATEGORIES,
  CLOUDINARY_FOLDER_COMBOS,
  CLOUDINARY_FOLDER_ITEMS,
  CLOUDINARY_FOLDER_PURCHASE_BILLS,
  isPurchaseBillCloudinaryFolder,
} from "@/lib/cloudinary-folders";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_BILL_BYTES = 12 * 1024 * 1024;
const FOLDERS = new Set([
  CLOUDINARY_FOLDER_ITEMS,
  CLOUDINARY_FOLDER_COMBOS,
  CLOUDINARY_FOLDER_CATEGORIES,
  CLOUDINARY_FOLDER_PURCHASE_BILLS,
]);

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_TOKEN_COOKIE)?.value;
  if (!(await verifyAdminToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const folderRaw = String(form.get("folder") ?? CLOUDINARY_FOLDER_ITEMS).trim();
  const isBill = isPurchaseBillCloudinaryFolder(folderRaw);
  const folder = isBill
    ? folderRaw
    : FOLDERS.has(folderRaw)
      ? folderRaw
      : CLOUDINARY_FOLDER_ITEMS;
  const pdf = isPdf(file);

  if (isBill) {
    if (!file.type.startsWith("image/") && !pdf) {
      return NextResponse.json(
        { error: "Bill must be a photo or PDF" },
        { status: 400 },
      );
    }
    if (file.size > MAX_BILL_BYTES) {
      return NextResponse.json({ error: "File must be under 12 MB" }, { status: 400 });
    }
  } else {
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image must be under 8 MB" }, { status: 400 });
    }
  }

  const publicId = String(form.get("publicId") ?? `upload-${Date.now()}`).trim();
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = pdf ? "application/pdf" : file.type || "image/jpeg";
  const dataUri = `data:${mime};base64,${bytes.toString("base64")}`;

  try {
    const url = isBill
      ? await uploadFileToCloudinary({
          source: dataUri,
          folder,
          publicId,
          resourceType: pdf ? "raw" : "image",
        })
      : await uploadMenuImageToCloudinary({
          source: dataUri,
          folder,
          publicId,
        });
    return NextResponse.json({ url, fileName: file.name });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
