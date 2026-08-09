import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
} from "expo/config-plugins.js";

const pluginDir = path.dirname(fileURLToPath(import.meta.url));
const templateDir = path.resolve(pluginDir, "../native/android");
const packageName = "com.onethingchanged.multiagent.mobile";
const kotlinFiles = [
  "MonitorStorage.kt",
  "MultiAgentMonitorModule.kt",
  "MultiAgentMonitorPackage.kt",
  "MultiAgentMonitorService.kt",
];

function addPermission(manifest, name) {
  manifest.manifest["uses-permission"] ??= [];
  if (!manifest.manifest["uses-permission"].some((entry) => entry?.$?.["android:name"] === name)) {
    manifest.manifest["uses-permission"].push({ $: { "android:name": name } });
  }
}

function withMonitorManifest(config) {
  return withAndroidManifest(config, (result) => {
    const manifest = result.modResults;
    addPermission(manifest, "android.permission.POST_NOTIFICATIONS");
    addPermission(manifest, "android.permission.FOREGROUND_SERVICE");
    addPermission(manifest, "android.permission.FOREGROUND_SERVICE_REMOTE_MESSAGING");
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    application.service ??= [];
    const serviceName = `${packageName}.MultiAgentMonitorService`;
    const existing = application.service.find((entry) => entry?.$?.["android:name"] === serviceName);
    const attributes = {
      "android:name": serviceName,
      "android:exported": "false",
      "android:stopWithTask": "false",
      "android:foregroundServiceType": "remoteMessaging",
    };
    if (existing) existing.$ = { ...existing.$, ...attributes };
    else application.service.push({ $: attributes });
    return result;
  });
}

function withMonitorSources(config) {
  return withDangerousMod(config, ["android", async (result) => {
    const target = path.join(
      result.modRequest.platformProjectRoot,
      "app/src/main/java",
      ...packageName.split("."),
    );
    fs.mkdirSync(target, { recursive: true });
    for (const file of kotlinFiles) {
      fs.copyFileSync(path.join(templateDir, file), path.join(target, file));
    }
    const drawableDir = path.join(result.modRequest.platformProjectRoot, "app/src/main/res/drawable");
    fs.mkdirSync(drawableDir, { recursive: true });
    fs.copyFileSync(
      path.resolve(pluginDir, "../assets/android-icon-monochrome.png"),
      path.join(drawableDir, "multiagent_notification_icon.png"),
    );
    return result;
  }]);
}

function withMonitorPackage(config) {
  return withMainApplication(config, (result) => {
    let source = result.modResults.contents;
    const importLine = `import ${packageName}.MultiAgentMonitorPackage`;
    if (!source.includes(importLine)) {
      source = source.replace(/^(package\s+[^\r\n]+\r?\n)/, `$1\n${importLine}\n`);
    }
    if (!source.includes("add(MultiAgentMonitorPackage())")) {
      const marker = /PackageList\(this\)\.packages\.apply\s*\{/;
      if (!marker.test(source)) {
        throw new Error("Unable to register MultiAgentMonitorPackage in MainApplication.kt");
      }
      source = source.replace(marker, (match) => `${match}\n              add(MultiAgentMonitorPackage())`);
    }
    result.modResults.contents = source;
    return result;
  });
}

function withForegroundMonitor(config) {
  config = withMonitorManifest(config);
  config = withMonitorSources(config);
  config = withMonitorPackage(config);
  return config;
}

export default createRunOncePlugin(withForegroundMonitor, "multiagent-foreground-monitor", "1.0.0");
