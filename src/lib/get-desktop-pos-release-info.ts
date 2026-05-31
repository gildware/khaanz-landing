import { getDesktopPosDownloadUrls } from "@/lib/pos-desktop-download-config";
import {
  fetchLatestDesktopPosReleaseUrls,
  getDesktopPosGithubRepo,
} from "@/lib/pos-desktop-github-releases";

export type DesktopPosReleaseInfo = {
  mac: string;
  windows: string;
  version: string | null;
  releaseUrl: string | null;
  publishedAt: string | null;
  githubRepo: string;
  source: {
    mac: "github" | "env" | null;
    windows: "github" | "env" | null;
  };
};

/** Latest installer links: GitHub Release first, env URLs as fallback only. */
export async function getDesktopPosReleaseInfo(): Promise<DesktopPosReleaseInfo> {
  const envUrls = getDesktopPosDownloadUrls();
  const fromGithub = await fetchLatestDesktopPosReleaseUrls();

  const mac = fromGithub?.mac || envUrls.mac || "";
  const windows = fromGithub?.windows || envUrls.windows || "";

  return {
    mac,
    windows,
    version: fromGithub?.version ?? null,
    releaseUrl: fromGithub?.releaseUrl ?? null,
    publishedAt: fromGithub?.publishedAt ?? null,
    githubRepo: getDesktopPosGithubRepo(),
    source: {
      mac: fromGithub?.mac ? "github" : envUrls.mac ? "env" : null,
      windows: fromGithub?.windows ? "github" : envUrls.windows ? "env" : null,
    },
  };
}
