import { readFile, writeFile } from "node:fs/promises";

const distRoot = new URL("../dist/", import.meta.url);
const html = await readFile(new URL("index.html", distRoot), "utf8");
const policy = readContentSecurityPolicy(html);
const output = `/*
  Content-Security-Policy: ${policy}; frame-ancestors 'none'
  Cross-Origin-Opener-Policy: same-origin-allow-popups
  Cross-Origin-Resource-Policy: same-origin
  Permissions-Policy: camera=(), geolocation=(), microphone=(), payment=(), usb=()
  Referrer-Policy: strict-origin-when-cross-origin
  Strict-Transport-Security: max-age=31536000
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY

/
  Cache-Control: no-cache, no-store, must-revalidate

/*.html
  Cache-Control: no-cache, no-store, must-revalidate

/manifest.json
  Cache-Control: no-cache, no-store, must-revalidate

/push-handler.js
  Cache-Control: no-cache, no-store, must-revalidate

/register-service-worker.js
  Cache-Control: no-cache, no-store, must-revalidate

/sw.js
  Cache-Control: no-cache, no-store, must-revalidate

/_expo/static/*
  Cache-Control: public, max-age=31536000, immutable

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/workbox-*.js
  Cache-Control: public, max-age=31536000, immutable
`;

await writeFile(new URL("_headers", distRoot), output, "utf8");
console.log("Generated the production web security-header artifact.");

function readContentSecurityPolicy(document) {
  const tag = document.match(
    /<meta[^>]+http-equiv="Content-Security-Policy"[^>]*>/,
  )?.[0];
  const encoded = tag?.match(/\bcontent="([^"]*)"/)?.[1];
  if (!encoded) {
    throw new Error("Cannot generate headers without the document CSP.");
  }

  const policy = encoded
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&");
  if (/[\r\n]/.test(policy)) {
    throw new Error("The document CSP contains an invalid line break.");
  }
  return policy;
}
