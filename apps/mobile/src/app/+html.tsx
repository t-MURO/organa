import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

const expoHydrationScriptHash =
  "'sha256-67fhrP0+BkBqmgGGXTtgiVO/9EQs3QruYNU/7fnRkI8='";
const contentSecurityPolicy = createContentSecurityPolicy(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
);

export default function RootHtml({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta content="IE=edge" httpEquiv="X-UA-Compatible" />
        <meta
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
          name="viewport"
        />
        <meta content="#f4f0e7" name="theme-color" />
        <meta
          content="Organa is a calm, offline-first space for tasks, routines, and thoughts."
          name="description"
        />
        <meta
          content={contentSecurityPolicy}
          httpEquiv="Content-Security-Policy"
        />
        <link href="/manifest.json" rel="manifest" />
        <link href="/icons/organa.svg" rel="icon" type="image/svg+xml" />
        <link href="/icons/organa-192.png" rel="apple-touch-icon" />
        <style dangerouslySetInnerHTML={{ __html: accessibilityCss }} />
        <script src="/register-service-worker.js" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}

const accessibilityCss = `
  :where(button, a[href], [role="button"], [role="checkbox"], [role="radio"], [role="switch"]) {
    min-block-size: 24px !important;
    min-inline-size: 24px !important;
  }
  :focus-visible {
    outline: 3px solid #327061 !important;
    outline-offset: 3px !important;
  }
  @media (pointer: coarse) {
    :where(button, a[href], [role="button"], [role="checkbox"], [role="radio"], [role="switch"]) {
      position: relative;
    }
    :where(button, a[href], [role="button"], [role="checkbox"], [role="radio"], [role="switch"])::after {
      content: "";
      height: max(100%, 44px);
      left: 50%;
      min-height: 44px;
      min-width: 44px;
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      width: max(100%, 44px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
      transition-duration: 0.01ms !important;
    }
  }
`;

function createContentSecurityPolicy(supabaseUrl: string | undefined) {
  const connectSources = new Set(["'self'"]);
  const supabaseOrigin = parseConnectOrigin(supabaseUrl);
  if (supabaseOrigin) {
    connectSources.add(supabaseOrigin.http);
    connectSources.add(supabaseOrigin.webSocket);
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    `connect-src ${[...connectSources].join(" ")}`,
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-src 'none'",
    "img-src 'self' data: blob:",
    "manifest-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    `script-src 'self' ${expoHydrationScriptHash}`,
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
  ].join("; ");
}

function parseConnectOrigin(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value.trim());
    const loopback =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]";
    if (
      (url.protocol !== "https:" &&
        !(url.protocol === "http:" && loopback)) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return undefined;
    }
    return {
      http: url.origin,
      webSocket: `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`,
    };
  } catch {
    return undefined;
  }
}
