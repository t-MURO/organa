const path = require("node:path");

const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const nativeWebCryptoShim = path.resolve(
  __dirname,
  "src/compat/isomorphic-webcrypto.native.ts",
);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    platform !== "web" &&
    moduleName === "isomorphic-webcrypto/src/react-native"
  ) {
    return {
      filePath: nativeWebCryptoShim,
      type: "sourceFile",
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
