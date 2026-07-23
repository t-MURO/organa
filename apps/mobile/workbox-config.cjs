module.exports = {
  cleanupOutdatedCaches: true,
  clientsClaim: true,
  globDirectory: "dist",
  globPatterns: [
    "**/*.{html,js,css,json,ico,png,svg,ttf,woff,woff2}"
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
