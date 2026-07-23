import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "expo-crypto": fileURLToPath(
        new URL(
          "../../packages/crypto/src/expo-crypto.test-adapter.ts",
          import.meta.url,
        ),
      ),
    },
  },
});
