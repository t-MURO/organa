const rawArguments = process.argv.slice(2);
const [originArgument, ...unexpectedArguments] =
  rawArguments[0] === "--" ? rawArguments.slice(1) : rawArguments;
if (!originArgument || unexpectedArguments.length > 0) {
  throw new Error(
    "Usage: node verify-web-deployment.mjs https://organa.example",
  );
}

const origin = parseOrigin(originArgument);
const checks = [];
const documentResponse = await fetchSameOrigin(origin, "/");
const html = await documentResponse.text();
const documentPolicy = readContentSecurityPolicy(html);
const responsePolicy =
  documentResponse.headers.get("content-security-policy") ?? "";
const documentDirectives = readDirectives(documentPolicy);

ok(
  responsePolicy === `${documentPolicy}; frame-ancestors 'none'`,
  "response CSP exactly extends the document policy with clickjacking protection",
);
ok(
  documentDirectives.size === 13 &&
    documentDirectives.get("default-src") === "'self'" &&
    documentDirectives.get("base-uri") === "'self'" &&
    documentDirectives.get("form-action") === "'self'" &&
    documentDirectives.get("frame-src") === "'none'" &&
    documentDirectives.get("object-src") === "'none'",
  "document CSP has the exact baseline and blocks framing and object content",
);
const scriptSources =
  documentDirectives.get("script-src")?.split(" ") ?? [];
ok(
  scriptSources.length === 2 &&
    scriptSources[0] === "'self'" &&
    /^'sha256-[A-Za-z0-9+/]{43}='$/.test(scriptSources[1] ?? "") &&
    !responsePolicy.includes("'unsafe-eval'") &&
    !scriptSources.includes("'unsafe-inline'"),
  "response CSP permits only same-origin scripts and one exact inline hash",
);
const connectSources =
  documentDirectives.get("connect-src")?.split(" ") ?? [];
ok(
  connectSources.length === 3 &&
    connectSources[0] === "'self'" &&
    isHttpsWebSocketPair(connectSources.slice(1)),
  "response CSP permits only self and one paired Supabase HTTPS/WebSocket origin",
);
ok(
  documentResponse.headers.get("x-content-type-options") === "nosniff" &&
    documentResponse.headers.get("x-frame-options") === "DENY",
  "MIME sniffing and legacy framing are blocked",
);
ok(
  documentResponse.headers.get("referrer-policy") ===
    "strict-origin-when-cross-origin",
  "cross-origin referrers disclose only the origin",
);
ok(
  documentResponse.headers.get("cross-origin-opener-policy") ===
    "same-origin-allow-popups" &&
    documentResponse.headers.get("cross-origin-resource-policy") ===
      "same-origin",
  "cross-origin window and resource policies preserve OAuth while isolating app resources",
);
ok(
  documentResponse.headers.get("permissions-policy") ===
    "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "unused browser capabilities are disabled",
);
ok(
  hasDirective(
    documentResponse.headers.get("strict-transport-security"),
    "max-age=31536000",
  ),
  "HTTPS is pinned for one year",
);
ok(
  requiresRevalidation(documentResponse.headers.get("cache-control")),
  "the application shell requires network revalidation",
);

for (const path of [
  "/manifest.json",
  "/push-handler.js",
  "/register-service-worker.js",
  "/sw.js",
]) {
  const response = await fetchSameOrigin(origin, path);
  await response.body?.cancel();
  ok(
    requiresRevalidation(response.headers.get("cache-control")),
    `${path} requires network revalidation`,
  );
}

const applicationBundle = html.match(
  /<script[^>]+\bsrc="(\/_expo\/static\/js\/web\/entry-[a-f0-9]+\.js)"/,
)?.[1];
ok(
  Boolean(applicationBundle),
  "the document references a fingerprinted app bundle",
);
if (applicationBundle) {
  const response = await fetchSameOrigin(origin, applicationBundle);
  await response.body?.cancel();
  ok(
    isImmutable(response.headers.get("cache-control")),
    "the fingerprinted app bundle has an immutable cache policy",
  );
}

console.log(
  `Production web deployment verification passed (${checks.length} checks).`,
);

function parseOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("The web deployment must be a valid HTTPS origin.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "The web deployment must be an HTTPS origin without credentials, path, query, or fragment.",
    );
  }
  return url.origin;
}

async function fetchSameOrigin(origin, path) {
  const response = await fetch(new URL(path, origin), {
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}.`);
  }
  if (new URL(response.url).origin !== origin) {
    throw new Error(`${path} redirected outside the deployment origin.`);
  }
  return response;
}

function readContentSecurityPolicy(document) {
  const tag = document.match(
    /<meta[^>]+http-equiv="Content-Security-Policy"[^>]*>/,
  )?.[0];
  const encoded = tag?.match(/\bcontent="([^"]*)"/)?.[1];
  if (!encoded) throw new Error("The deployed document CSP is missing.");
  return encoded
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&");
}

function readDirectives(policy) {
  return new Map(
    policy.split(";").map((entry) => {
      const directive = entry.trim();
      const separator = directive.indexOf(" ");
      return separator < 0
        ? [directive, ""]
        : [directive.slice(0, separator), directive.slice(separator + 1)];
    }),
  );
}

function isHttpsWebSocketPair(values) {
  try {
    const urls = values.map((value) => new URL(value));
    const https = urls.find((url) => url.protocol === "https:");
    const webSocket = urls.find((url) => url.protocol === "wss:");
    return (
      https &&
      webSocket &&
      https.host === webSocket.host &&
      urls.every(
        (url) =>
          !url.username &&
          !url.password &&
          url.pathname === "/" &&
          !url.search &&
          !url.hash,
      )
    );
  } catch {
    return false;
  }
}

function hasDirective(value, expected) {
  return (
    value
      ?.split(",")
      .map((part) => part.trim())
      .includes(expected) ?? false
  );
}

function requiresRevalidation(value) {
  return (
    hasDirective(value, "no-cache") &&
    hasDirective(value, "no-store") &&
    hasDirective(value, "must-revalidate")
  );
}

function isImmutable(value) {
  return (
    hasDirective(value, "public") &&
    hasDirective(value, "max-age=31536000") &&
    hasDirective(value, "immutable")
  );
}

function ok(condition, label) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  checks.push(label);
}
