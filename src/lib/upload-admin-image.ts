export async function uploadAdminImage(input: {
  file: File;
  folder: string;
  publicId: string;
}): Promise<string> {
  const body = new FormData();
  body.set("file", input.file);
  body.set("folder", input.folder);
  body.set("publicId", input.publicId);
  const res = await fetch("/api/admin/media/upload", {
    method: "POST",
    body,
    credentials: "include",
  });
  const json = (await res.json().catch(() => ({}))) as {
    url?: string;
    fileName?: string;
    error?: string;
  };
  if (!res.ok || !json.url) {
    throw new Error(json.error || "Image upload failed");
  }
  return json.url;
}

export async function uploadAdminFile(input: {
  file: File;
  folder: string;
  publicId: string;
}): Promise<{ url: string; fileName: string }> {
  const body = new FormData();
  body.set("file", input.file);
  body.set("folder", input.folder);
  body.set("publicId", input.publicId);
  const res = await fetch("/api/admin/media/upload", {
    method: "POST",
    body,
    credentials: "include",
  });
  const json = (await res.json().catch(() => ({}))) as {
    url?: string;
    fileName?: string;
    error?: string;
  };
  if (!res.ok || !json.url) {
    throw new Error(json.error || "Upload failed");
  }
  return { url: json.url, fileName: json.fileName || input.file.name };
}
