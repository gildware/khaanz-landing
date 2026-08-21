import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import { uploadMenuImageToCloudinary } from "@/lib/cloudinary";
import {
  CLOUDINARY_FOLDER_CATEGORIES,
  CLOUDINARY_FOLDER_COMBOS,
  CLOUDINARY_FOLDER_ITEMS,
} from "@/lib/cloudinary-folders";

const MAX_BYTES = 8 * 1024 * 1024;
const FOLDERS = new Set([
  CLOUDINARY_FOLDER_ITEMS,
  CLOUDINARY_FOLDER_COMBOS,
  CLOUDINARY_FOLDER_CATEGORIES,
]);

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
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image must be under 8 MB" }, { status: 400 });
  }

  const folderRaw = String(form.get("folder") ?? CLOUDINARY_FOLDER_ITEMS).trim();
  const folder = FOLDERS.has(folderRaw) ? folderRaw : CLOUDINARY_FOLDER_ITEMS;
  const publicId = String(form.get("publicId") ?? `upload-${Date.now()}`).trim();

  const bytes = Buffer.from(await file.arrayBuffer());
  const dataUri = `data:${file.type};base64,${bytes.toString("base64")}`;

  try {
    const url = await uploadMenuImageToCloudinary({
      source: dataUri,
      folder,
      publicId,
    });
    return NextResponse.json({ url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
