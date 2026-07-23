const { createHash } = require("node:crypto");
const { readdirSync, readFileSync } = require("node:fs");
const { join, relative, sep } = require("node:path");

module.exports = {
  additionalManifestEntries: fontManifestEntries(),
  cleanupOutdatedCaches: true,
  clientsClaim: true,
  globDirectory: "dist",
  globPatterns: [
    "**/*.{html,js,css,json,ico,png,svg,ttf,woff,woff2,wav}"
  ],
  globIgnores: [
    "**/expo-router/**",
    "**/200ExtraLight/**",
    "**/300Light/**",
    "**/500Medium/**"
  ],
  maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
  navigateFallback: "/index.html",
  runtimeCaching: [
    {
      handler: "NetworkOnly",
      urlPattern: /^https:\/\/.*\.supabase\.co\//
    }
  ],
  skipWaiting: false,
  swDest: "dist/sw.js"
};

function fontManifestEntries() {
  const distDirectory = join(__dirname, "dist");
  const assetsDirectory = join(distDirectory, "assets");
  const usedWeights =
    /Manrope_(400Regular|600SemiBold|700Bold|800ExtraBold)\..+\.ttf$/;

  return filesUnder(assetsDirectory)
    .filter((file) => usedWeights.test(file))
    .map((file) => ({
      revision: createHash("sha256")
        .update(readFileSync(file))
        .digest("hex"),
      url: relative(distDirectory, file).split(sep).join("/")
    }));
}

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}
