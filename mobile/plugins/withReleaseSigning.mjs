import { withAppBuildGradle } from "expo/config-plugins.js";

const CONFIG_MARKER = "// multiagent-secure-release-signing";

export default function withReleaseSigning(config) {
  return withAppBuildGradle(config, (result) => {
    if (result.modResults.language !== "groovy") return result;
    let source = result.modResults.contents;
    if (source.includes(CONFIG_MARKER)) return result;

    const variables = `${CONFIG_MARKER}
def multiAgentKeystorePath = System.getenv("MULTIAGENT_ANDROID_KEYSTORE_PATH")
def multiAgentKeystorePassword = System.getenv("MULTIAGENT_ANDROID_KEYSTORE_PASSWORD")
def multiAgentKeyAlias = System.getenv("MULTIAGENT_ANDROID_KEY_ALIAS")
def multiAgentKeyPassword = System.getenv("MULTIAGENT_ANDROID_KEY_PASSWORD")
def multiAgentAllowDebugRelease = System.getenv("MULTIAGENT_ALLOW_DEBUG_RELEASE") == "1"
def multiAgentReleaseSigningReady = [
    multiAgentKeystorePath,
    multiAgentKeystorePassword,
    multiAgentKeyAlias,
    multiAgentKeyPassword,
].every { value -> value != null && !value.trim().isEmpty() }
def multiAgentReleaseRequested = gradle.startParameter.taskNames.any {
    taskName -> taskName.toLowerCase().contains("release")
}
if (multiAgentReleaseRequested && !multiAgentReleaseSigningReady && !multiAgentAllowDebugRelease) {
    throw new GradleException("Secure release signing is required. Set the MULTIAGENT_ANDROID_* environment variables.")
}
`;
    source = source.replace(
      "def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()",
      `def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()\n\n${variables}`,
    );
    source = source.replace(
      /    signingConfigs \{\r?\n([\s\S]*?)\r?\n    \}\r?\n    buildTypes \{/,
      (match, existing) => `    signingConfigs {\n${existing}\n        release {\n            if (multiAgentReleaseSigningReady) {\n                storeFile file(multiAgentKeystorePath)\n                storePassword multiAgentKeystorePassword\n                keyAlias multiAgentKeyAlias\n                keyPassword multiAgentKeyPassword\n            }\n        }\n    }\n    buildTypes {`,
    );
    source = source.replace(
      "            signingConfig signingConfigs.debug\n            def enableShrinkResources",
      "            signingConfig multiAgentReleaseSigningReady ? signingConfigs.release : signingConfigs.debug\n            def enableShrinkResources",
    );
    result.modResults.contents = source;
    return result;
  });
}
