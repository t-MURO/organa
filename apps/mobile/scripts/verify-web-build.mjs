import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const distRoot = new URL("../dist/", import.meta.url);
const [
  html,
  manifestText,
  pushHandler,
  serviceWorkerRegistration,
  serviceWorker,
  hostingHeaders,
  routesText,
] = await Promise.all([
  readFile(new URL("index.html", distRoot), "utf8"),
  readFile(new URL("manifest.json", distRoot), "utf8"),
  readFile(new URL("push-handler.js", distRoot), "utf8"),
  readFile(new URL("register-service-worker.js", distRoot), "utf8"),
  readFile(new URL("sw.js", distRoot), "utf8"),
  readFile(new URL("_headers", distRoot), "utf8"),
  readFile(new URL("_expo/.routes.json", distRoot), "utf8"),
]);
const manifest = JSON.parse(manifestText);
const routes = JSON.parse(routesText);
const checks = [];
const policy = readContentSecurityPolicy(html);
const applicationBundlePath = html.match(
  /<script[^>]+\bsrc="(\/_expo\/static\/js\/web\/entry-[a-f0-9]+\.js)"/,
)?.[1];
const applicationBundle = applicationBundlePath
  ? await readFile(new URL(applicationBundlePath.slice(1), distRoot), "utf8")
  : "";

ok(
  /<title[^>]*>Organa<\/title>/.test(html),
  "document has a meaningful title",
);
ok(
  manifest.display === "standalone" &&
    manifest.start_url === "/" &&
    manifest.scope === "/",
  "manifest is installable within the app scope",
);
ok(
  manifest.icons.some(
    (icon) => icon.sizes === "192x192" && icon.purpose === "any",
  ),
  "manifest includes a 192-pixel icon",
);
ok(
  manifest.icons.some(
    (icon) => icon.sizes === "512x512" && icon.purpose === "any",
  ),
  "manifest includes a 512-pixel icon",
);
ok(
  manifest.icons.some(
    (icon) => icon.sizes === "512x512" && icon.purpose === "maskable",
  ),
  "manifest includes a maskable icon",
);
ok(
  Boolean(applicationBundlePath) &&
    serviceWorker.includes(applicationBundlePath.slice(1)),
  "service worker precaches the application bundle",
);
ok(
  serviceWorker.includes("push-handler.js"),
  "service worker imports the Web Push handler",
);
ok(
  html.includes('src="/register-service-worker.js"') &&
    serviceWorkerRegistration.includes("organa:update-ready") &&
    serviceWorkerRegistration.includes("registration.waiting") &&
    serviceWorkerRegistration.includes("navigator.serviceWorker.controller") &&
    serviceWorkerRegistration.includes('updateViaCache: "none"'),
  "application shell announces only a waiting replacement worker",
);
ok(
  serviceWorker.includes("register-service-worker.js"),
  "service worker precaches its external registration bootstrap",
);
ok(
  policy.directives.size === 13 &&
    policy.directives.get("default-src") === "'self'" &&
    policy.directives.get("base-uri") === "'self'" &&
    policy.directives.get("form-action") === "'self'" &&
    policy.directives.get("object-src") === "'none'" &&
    policy.directives.get("frame-src") === "'none'" &&
    policy.directives.get("manifest-src") === "'self'" &&
    policy.directives.get("media-src") === "'self'",
  "content security policy has the exact baseline and blocks objects and frames",
);
const connectSources = policy.directives.get("connect-src")?.split(" ") ?? [];
const remoteConnectSources = connectSources.filter(
  (source) => source !== "'self'",
);
const remoteConnectUrls = remoteConnectSources.map(parseUrl);
ok(
  connectSources[0] === "'self'" &&
    (remoteConnectSources.length === 0 ||
      (remoteConnectSources.length === 2 &&
        remoteConnectUrls.every(Boolean) &&
        isAllowedHttpWebSocketPair(remoteConnectUrls))),
  "content security policy allows only self or one paired Supabase HTTP/WebSocket origin",
);
const configuredHttpOrigin = remoteConnectUrls.find(
  (url) => url?.protocol === "http:" || url?.protocol === "https:",
);
ok(
  Boolean(applicationBundle) &&
    (!configuredHttpOrigin ||
      applicationBundle.includes(configuredHttpOrigin.origin)) &&
    !hasDifferentSupabaseCloudOrigin(applicationBundle, configuredHttpOrigin),
  "application bundle Supabase origin matches the content security policy",
);

const inlineScripts = [
  ...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g),
].map((match) => match[1]);
const expectedInlineScript = "globalThis.__EXPO_ROUTER_HYDRATE__=true;";
const expectedInlineHash = `'sha256-${createHash("sha256")
  .update(expectedInlineScript)
  .digest("base64")}'`;
const scriptSources = policy.directives.get("script-src") ?? "";
ok(
  inlineScripts.length === 1 &&
    inlineScripts[0] === expectedInlineScript &&
    scriptSources === `'self' ${expectedInlineHash}` &&
    policy.directives.get("style-src") === "'self' 'unsafe-inline'" &&
    policy.directives.get("worker-src") === "'self' blob:",
  "scripts allow only same-origin assets and the exact Expo hydration hash",
);
const routeHeaders = routes.headers ?? {};
ok(
  Object.keys(routeHeaders).length === 9 &&
    routeHeaders["Cache-Control"] ===
      "no-cache, no-store, must-revalidate" &&
    routeHeaders["Content-Security-Policy"] ===
      `${policy.content}; frame-ancestors 'none'` &&
    routeHeaders["Cross-Origin-Opener-Policy"] ===
      "same-origin-allow-popups" &&
    routeHeaders["Cross-Origin-Resource-Policy"] === "same-origin" &&
    routeHeaders["Permissions-Policy"] ===
      "camera=(), geolocation=(), microphone=(), payment=(), usb=()" &&
    routeHeaders["Referrer-Policy"] ===
      "strict-origin-when-cross-origin" &&
    routeHeaders["Strict-Transport-Security"] === "max-age=31536000" &&
    routeHeaders["X-Content-Type-Options"] === "nosniff" &&
    routeHeaders["X-Frame-Options"] === "DENY",
  "Expo route metadata carries the exact document security policy",
);
ok(
  hostingHeaders.includes(
    `Content-Security-Policy: ${policy.content}; frame-ancestors 'none'`,
  ) &&
    hostingHeaders.includes("X-Content-Type-Options: nosniff") &&
    hostingHeaders.includes("X-Frame-Options: DENY") &&
    hostingHeaders.includes(
      "Referrer-Policy: strict-origin-when-cross-origin",
    ),
  "deployment header artifact extends the exact CSP and enables browser hardening",
);
ok(
  hostingHeaders.includes(
    "Permissions-Policy: camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  ) &&
    hostingHeaders.includes(
      "Strict-Transport-Security: max-age=31536000",
    ),
  "deployment header artifact restricts unused capabilities and requires HTTPS",
);
ok(
  /\n\/\s+Cache-Control: no-cache, no-store, must-revalidate/.test(
    hostingHeaders,
  ) &&
    /\/sw\.js\s+Cache-Control: no-cache, no-store, must-revalidate/.test(
      hostingHeaders,
    ) &&
    /\/register-service-worker\.js\s+Cache-Control: no-cache, no-store, must-revalidate/.test(
      hostingHeaders,
    ),
  "application shell and service-worker entry points require revalidation",
);
ok(
  /\/_expo\/static\/\*\s+Cache-Control: public, max-age=31536000, immutable/.test(
    hostingHeaders,
  ) &&
    /\/assets\/\*\s+Cache-Control: public, max-age=31536000, immutable/.test(
      hostingHeaders,
    ),
  "fingerprinted web assets are immutable",
);
ok(
  serviceWorker.includes("SKIP_WAITING") &&
    serviceWorker.includes("skipWaiting()"),
  "service worker supports deliberate update activation",
);
ok(
  pushHandler.includes('addEventListener("push"') &&
    pushHandler.includes("showNotification"),
  "Web Push displays a persistent system notification",
);
ok(
  pushHandler.includes('addEventListener("notificationclick"') &&
    pushHandler.includes("openWindow"),
  "Web Push notifications deep-link back into Organa",
);
ok(
  pushHandler.includes("Something in Organa is ready when you are.") &&
    !pushHandler.includes("taskTitle") &&
    !pushHandler.includes("medication"),
  "Web Push handler contains only generic notification copy",
);

for (const weight of [
  "400Regular",
  "600SemiBold",
  "700Bold",
  "800ExtraBold",
]) {
  ok(
    serviceWorker.includes(`Manrope_${weight}`),
    `service worker precaches Manrope ${weight}`,
  );
}

for (const sound of ["create", "complete"]) {
  ok(
    new RegExp(`assets/audio/${sound}\\.[a-f0-9]+\\.wav`).test(
      serviceWorker,
    ),
    `service worker precaches the ${sound} sound`,
  );
}

console.log(
  `Production web build verification passed (${checks.length} checks in ${appRoot}).`,
);

function ok(condition, label) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  checks.push(label);
}

function readContentSecurityPolicy(document) {
  const tag = document.match(
    /<meta[^>]+http-equiv="Content-Security-Policy"[^>]*>/,
  )?.[0];
  const encoded = tag?.match(/\bcontent="([^"]*)"/)?.[1];
  if (!encoded) throw new Error("FAILED: content security policy is missing");
  const content = encoded
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&");
  return {
    content,
    directives: new Map(
      content.split("; ").map((directive) => {
        const separator = directive.indexOf(" ");
        return separator < 0
          ? [directive, ""]
          : [directive.slice(0, separator), directive.slice(separator + 1)];
      }),
    ),
  };
}

function parseUrl(value) {
  try {
    const url = new URL(value);
    return url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
      ? undefined
      : url;
  } catch {
    return undefined;
  }
}

function isAllowedHttpWebSocketPair(urls) {
  const http = urls.find(
    (url) => url.protocol === "https:" || url.protocol === "http:",
  );
  const webSocket = urls.find(
    (url) => url.protocol === "wss:" || url.protocol === "ws:",
  );
  return (
    http &&
    webSocket &&
    http.host === webSocket.host &&
    (http.protocol === "https:"
      ? webSocket.protocol === "wss:"
      : webSocket.protocol === "ws:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(http.hostname))
  );
}

function hasDifferentSupabaseCloudOrigin(bundle, configuredOrigin) {
  const configuredHost = configuredOrigin?.host;
  const origins = [
    ...bundle.matchAll(
      /https:\/\/[a-z0-9-]+\.supabase\.co/gi,
    ),
  ].map((match) => new URL(match[0]));
  return origins.some((origin) => origin.host !== configuredHost);
}
