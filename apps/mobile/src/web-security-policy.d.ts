export const expoHydrationScriptHash: string;

export function createContentSecurityPolicy(
  supabaseUrl: string | undefined,
): string;

export function createWebResponseHeaders(
  contentSecurityPolicy: string,
): Record<string, string>;
