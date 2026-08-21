import { v2 as cloudinary } from "cloudinary";

type CloudinaryEnv = {
  cloud_name: string;
  api_key: string;
  api_secret: string;
};

function readCloudinaryEnv(): CloudinaryEnv | null {
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME?.trim() ?? "";
  const api_key = process.env.CLOUDINARY_API_KEY?.trim() ?? "";
  const api_secret = process.env.CLOUDINARY_API_SECRET?.trim() ?? "";
  if (!cloud_name || !api_key || !api_secret) return null;
  return { cloud_name, api_key, api_secret };
}

export function isCloudinaryConfigured(): boolean {
  return readCloudinaryEnv() !== null;
}

function client() {
  const cfg = readCloudinaryEnv();
  if (!cfg) {
    throw new Error(
      "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.",
    );
  }
  cloudinary.config(cfg);
  return cloudinary;
}

export function isCloudinaryUrl(url: string): boolean {
  try {
    return new URL(url).hostname === "res.cloudinary.com";
  } catch {
    return false;
  }
}

export function isDataImageUrl(url: string): boolean {
  return url.trim().toLowerCase().startsWith("data:image/");
}

/** Insert auto format/quality/size for storefront thumbnails. */
export function cloudinaryDeliveryUrl(src: string): string {
  const t = src.trim();
  if (!isCloudinaryUrl(t)) return t;
  if (/\/upload\/(?:[^/]+,)+/.test(t) || t.includes("/upload/f_auto")) return t;
  return t.replace("/image/upload/", "/image/upload/f_auto,q_auto,c_limit,w_800/");
}

function sanitizePublicId(id: string): string {
  const s = id
    .trim()
    .replace(/[^a-zA-Z0-9/_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.length > 0 ? s : "image";
}

export async function uploadMenuImageToCloudinary(input: {
  source: string;
  folder: string;
  publicId: string;
}): Promise<string> {
  const cld = client();
  const result = await cld.uploader.upload(input.source, {
    folder: input.folder,
    public_id: sanitizePublicId(input.publicId),
    overwrite: true,
    resource_type: "image",
    invalidate: true,
  });
  if (!result.secure_url) {
    throw new Error("Cloudinary upload returned no URL");
  }
  return result.secure_url;
}

/**
 * Never persist base64 in the database. Data URLs are uploaded; Cloudinary
 * URLs are kept; other http(s) or site paths are left for the migrator.
 */
export async function persistImageAsCloudinaryUrl(
  image: string | undefined,
  folder: string,
  publicId: string,
): Promise<string> {
  const t = (image ?? "").trim();
  if (!t) return "";
  if (isCloudinaryUrl(t)) return t;
  if (isDataImageUrl(t)) {
    return uploadMenuImageToCloudinary({ source: t, folder, publicId });
  }
  return t;
}
