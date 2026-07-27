const {
  createContentSecurityPolicy,
  createWebResponseHeaders,
} = require("./src/web-security-policy");

module.exports = ({ config }) => {
  const headers = createWebResponseHeaders(
    createContentSecurityPolicy(process.env.EXPO_PUBLIC_SUPABASE_URL),
  );
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  let configuredRouter = false;
  const plugins = (config.plugins ?? []).map((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    if (name !== "expo-router") return plugin;
    configuredRouter = true;
    const options = Array.isArray(plugin) ? plugin[1] : undefined;
    return ["expo-router", { ...options, headers }];
  });

  if (!configuredRouter) {
    throw new Error("Organa requires the expo-router config plugin.");
  }

  return {
    ...config,
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
    plugins,
  };
};
