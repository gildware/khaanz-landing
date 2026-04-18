/**
 * Next.js `next dev` serves HTTP only. Browsers opening `https://localhost`
 * get ERR_SSL_PROTOCOL_ERROR. Use this for absolute links (e.g. WhatsApp) so
 * local dev URLs stay `http://localhost:...`.
 */
export function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

/**
 * Absolute URL to the current origin with a safe protocol for local dev.
 * Prefer this over `window.location.origin` when the link may be opened
 * elsewhere (WhatsApp, email) or when the page was mistakenly loaded over
 * HTTPS on localhost.
 */
export function buildSameOriginUrl(path: string): string {
  if (typeof window === "undefined") {
    return path.startsWith("/") ? path : `/${path}`;
  }
  const { hostname, host, protocol } = window.location;
  const proto = isLoopbackHostname(hostname) ? "http:" : protocol;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${proto}//${host}${normalized}`;
}
