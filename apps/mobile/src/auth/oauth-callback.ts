export type OAuthCallback =
  | { type: "code"; code: string }
  | { type: "error"; message: string }
  | { type: "ignore" };

export function parseOAuthCallback(
  callbackUrl: string,
  expectedRedirectUrl: string,
): OAuthCallback {
  let callback: URL;
  let expected: URL;
  try {
    callback = new URL(callbackUrl);
    expected = new URL(expectedRedirectUrl);
  } catch {
    return { type: "ignore" };
  }

  if (!matchesRedirect(callback, expected)) {
    return { type: "ignore" };
  }

  const parameters = mergedParameters(callback);
  const errorCode = parameters.get("error_code") ?? parameters.get("error");
  if (errorCode) {
    return {
      message:
        errorCode === "access_denied"
          ? "Sign-in was cancelled."
          : "Sign-in could not be completed. Please try again.",
      type: "error",
    };
  }

  const code = parameters.get("code")?.trim();
  return code ? { code, type: "code" } : { type: "ignore" };
}

export function createOAuthCallbackCoordinator(
  expectedRedirectUrl: string,
  exchangeCode: (code: string) => Promise<void>,
) {
  const completedCodes = new Set<string>();
  const exchanges = new Map<string, Promise<void>>();

  return {
    async handle(callbackUrl: string) {
      const callback = parseOAuthCallback(
        callbackUrl,
        expectedRedirectUrl,
      );
      if (callback.type === "ignore") return false;
      if (callback.type === "error") {
        throw new Error(callback.message);
      }
      if (completedCodes.has(callback.code)) return true;

      let exchange = exchanges.get(callback.code);
      if (!exchange) {
        exchange = exchangeCode(callback.code)
          .then(() => {
            completedCodes.add(callback.code);
          })
          .finally(() => {
            exchanges.delete(callback.code);
          });
        exchanges.set(callback.code, exchange);
      }

      await exchange;
      return true;
    },
  };
}

function matchesRedirect(callback: URL, expected: URL) {
  return (
    callback.protocol === expected.protocol &&
    callback.hostname === expected.hostname &&
    callback.port === expected.port &&
    normalizePath(callback.pathname) === normalizePath(expected.pathname)
  );
}

function normalizePath(path: string) {
  const normalized = path.replace(/\/+$/, "");
  return normalized || "/";
}

function mergedParameters(url: URL) {
  const parameters = new URLSearchParams(url.search);
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
  fragment.forEach((value, key) => {
    if (!parameters.has(key)) parameters.set(key, value);
  });
  return parameters;
}
