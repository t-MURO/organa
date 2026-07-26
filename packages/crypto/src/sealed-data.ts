import { toByteArray } from "base64-js";
import { AESSealedData } from "expo-crypto";

export function sealedDataFromBase64(combined: string) {
  return AESSealedData.fromCombined(toByteArray(combined));
}
