import { NextResponse } from "next/server";

import {
  fetchLatestDesktopPosReleaseUrls,
  getDesktopPosGithubRepo,
} from "@/lib/pos-desktop-github-releases";
import { getDesktopPosDownloadUrls } from "@/lib/pos-desktop-download-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const envUrls = getDesktopPosDownloadUrls();
  const fromGithub = await fetchLatestDesktopPosReleaseUrls();

  const mac = envUrls.mac || fromGithub?.mac || "";
  const windows = envUrls.windows || fromGithub?.windows || "";

  return NextResponse.json({
    mac,
    windows,
    version: fromGithub?.version ?? null,
    releaseUrl: fromGithub?.releaseUrl ?? null,
    publishedAt: fromGithub?.publishedAt ?? null,
    githubRepo: getDesktopPosGithubRepo(),
    source: {
      mac: envUrls.mac ? "env" : fromGithub?.mac ? "github" : null,
      windows: envUrls.windows ? "env" : fromGithub?.windows ? "github" : null,
    },
  });
}
