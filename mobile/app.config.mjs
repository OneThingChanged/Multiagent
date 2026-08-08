const projectId = String(process.env.MULTIAGENT_EXPO_PROJECT_ID || "").trim();
const googleServicesFile = String(process.env.MULTIAGENT_GOOGLE_SERVICES_JSON || "").trim();

export default ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    eas: projectId ? { projectId } : config.extra?.eas,
  },
  android: {
    ...config.android,
    ...(googleServicesFile ? { googleServicesFile } : {}),
  },
});
