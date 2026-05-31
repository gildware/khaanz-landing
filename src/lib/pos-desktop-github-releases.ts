/** GitHub `owner/repo` for published desktop POS installers. */
export function getDesktopPosGithubRepo(): string {
  return (process.env.DESKTOP_POS_GITHUB_REPO ?? "gildware/khaanz-desktop-pos").trim();
}

type GhAsset = { name: string; browser_download_url: string };
type GhRelease = {
  tag_name: string;
  html_url: string;
  assets: GhAsset[];
};

export type DesktopPosReleaseUrls = {
  mac: string;
  windows: string;
  version: string;
  releaseUrl: string;
};

export function pickInstallerUrlsFromAssets(
  assets: GhAsset[],
): Pick<DesktopPosReleaseUrls, "mac" | "windows"> {
  const mac =
    assets.find((a) => /\.dmg$/i.test(a.name))?.browser_download_url ??
    assets.find((a) => /mac/i.test(a.name) && /\.zip$/i.test(a.name))
      ?.browser_download_url ??
    "";
  const windows =
    assets.find((a) => /setup.*\.exe$/i.test(a.name))?.browser_download_url ??
    assets.find((a) => /\.exe$/i.test(a.name) && !/elevate/i.test(a.name))
      ?.browser_download_url ??
    "";
  return { mac, windows };
}

/** Latest GitHub Release installer URLs (public repo). */
export async function fetchLatestDesktopPosReleaseUrls(): Promise<DesktopPosReleaseUrls | null> {
  const repo = getDesktopPosGithubRepo();
  if (!repo.includes("/")) return null;

  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "khaanz-admin",
    },
    next: { revalidate: 300 },
  });

  if (!res.ok) return null;

  const data = (await res.json()) as GhRelease;
  const { mac, windows } = pickInstallerUrlsFromAssets(data.assets ?? []);
  if (!mac && !windows) return null;

  return {
    mac,
    windows,
    version: (data.tag_name ?? "").replace(/^v/, ""),
    releaseUrl: data.html_url ?? `https://github.com/${repo}/releases/latest`,
  };
}
