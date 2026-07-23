import { getRandomValues } from "expo-crypto";

const nativeWebCrypto = {
  ensureSecure() {},
  getRandomValues,
  subtle: globalThis.crypto?.subtle,
};

export default nativeWebCrypto;
