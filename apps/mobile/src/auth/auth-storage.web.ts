import type { AuthStorage } from "./auth-storage.types";
import {
  getProtectedBrowserValue,
  removeProtectedBrowserValue,
  setProtectedBrowserValue,
} from "../security/protected-browser-storage";

export const authStorage: AuthStorage = {
  getItem: getProtectedBrowserValue,
  setItem: setProtectedBrowserValue,
  removeItem: removeProtectedBrowserValue,
};
