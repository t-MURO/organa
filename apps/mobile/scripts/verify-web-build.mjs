import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const distRoot = new URL("../dist/", import.meta.url);
const [html, manifestText, serviceWorker] = await Promise.all([
  readFile(new URL("index.html", distRoot), "utf8"),
  readFile(new URL("manifest.json", distRoot), "utf8"),
  readFile(new URL("sw.js", distRoot), "utf8"),
]);
const manifest = JSON.parse(manifestText);
const checks = [];

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
  /_expo\/static\/js\/web\/entry-[a-f0-9]+\.js/.test(serviceWorker),
  "service worker precaches the application bundle",
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
