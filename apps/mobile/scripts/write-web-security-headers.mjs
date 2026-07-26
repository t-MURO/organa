import { readFile, writeFile } from "node:fs/promises";

import webSecurityPolicy from "../src/web-security-policy.js";

const distRoot = new URL("../dist/", import.meta.url);
const html = await readFile(new URL("index.html", distRoot), "utf8");
const policy = readContentSecurityPolicy(html);
const responseHeaders =
  webSecurityPolicy.createWebResponseHeaders(policy);
const output = `/*
  Content-Security-Policy: ${responseHeaders["Content-Security-Policy"]}
  Cross-Origin-Opener-Policy: ${responseHeaders["Cross-Origin-Opener-Policy"]}
  Cross-Origin-Resource-Policy: ${responseHeaders["Cross-Origin-Resource-Policy"]}
  Permissions-Policy: ${responseHeaders["Permissions-Policy"]}
  Referrer-Policy: ${responseHeaders["Referrer-Policy"]}
  Strict-Transport-Security: ${responseHeaders["Strict-Transport-Security"]}
  X-Content-Type-Options: ${responseHeaders["X-Content-Type-Options"]}
  X-Frame-Options: ${responseHeaders["X-Frame-Options"]}

/
  Cache-Control: ${responseHeaders["Cache-Control"]}

/*.html
  Cache-Control: ${responseHeaders["Cache-Control"]}

/manifest.json
  Cache-Control: ${responseHeaders["Cache-Control"]}

/push-handler.js
  Cache-Control: ${responseHeaders["Cache-Control"]}

/register-service-worker.js
  Cache-Control: ${responseHeaders["Cache-Control"]}

/sw.js
  Cache-Control: ${responseHeaders["Cache-Control"]}

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
