import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

import { createContentSecurityPolicy } from "../web-security-policy";

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
