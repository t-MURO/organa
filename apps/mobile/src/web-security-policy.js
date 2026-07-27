const expoHydrationScriptHash =
  "'sha256-67fhrP0+BkBqmgGGXTtgiVO/9EQs3QruYNU/7fnRkI8='";

function createContentSecurityPolicy(supabaseUrl) {
  const connectSources = new Set(["'self'"]);
  const supabaseOrigin = parseConnectOrigin(supabaseUrl);
  if (supabaseOrigin) {
    connectSources.add(supabaseOrigin.http);
    connectSources.add(supabaseOrigin.webSocket);
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    `connect-src ${[...connectSources].join(" ")}`,
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-src 'none'",
    "img-src 'self' data: blob:",
    "manifest-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    `script-src 'self' ${expoHydrationScriptHash}`,
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
  ].join("; ");
}

function createWebResponseHeaders(contentSecurityPolicy) {
  if (
    typeof contentSecurityPolicy !== "string" ||
    !contentSecurityPolicy.trim() ||
    /[\r\n]/.test(contentSecurityPolicy)
  ) {
    throw new Error("A single-line content security policy is required.");
  }

  return {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Content-Security-Policy":
      `${contentSecurityPolicy}; frame-ancestors 'none'`,
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy":
      "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=31536000",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

function parseConnectOrigin(value) {
  if (!value) return undefined;
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      !/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return undefined;
    }
    return {
      http: url.origin,
      webSocket: `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`,
    };
  } catch {
    return undefined;
  }
}

module.exports = {
  createContentSecurityPolicy,
  createWebResponseHeaders,
  expoHydrationScriptHash,
};
