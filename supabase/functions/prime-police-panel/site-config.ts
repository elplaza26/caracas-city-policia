export const PANEL_SITE_URL = "https://primepolice.link/";
export const PANEL_ORIGIN = "https://primepolice.link";
const allowedOrigins = new Set([PANEL_ORIGIN, "https://primepolicerp.github.io"]);

export function isPanelOrigin(origin: string): boolean {
  return allowedOrigins.has(origin);
}

// Apply at the HTTP boundary so errors and responses from every module agree.
export function panelResponseHeaders(original: HeadersInit, origin: string | null): Headers {
  const headers = new Headers(original);
  headers.delete("Access-Control-Allow-Origin");
  if (origin && isPanelOrigin(origin)) headers.set("Access-Control-Allow-Origin", origin);
  const vary = new Set((headers.get("Vary") || "").split(",").map(v => v.trim()).filter(Boolean));
  vary.add("Origin");
  headers.set("Vary", [...vary].join(", "));
  return headers;
}
