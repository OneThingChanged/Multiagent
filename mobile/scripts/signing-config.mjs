import { X509Certificate } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const mobileRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const signingEnvPath = path.join(mobileRoot, ".env.signing.local");
export const signingPublicMetadataPath = path.join(mobileRoot, ".release-signing.public.local.json");

const defaultKeystorePath = path.join(
  os.homedir(),
  ".multiagent-signing",
  "multiagent-mobile-release.p12",
);

function fromEnvironmentOrFile(environment, values, name, fallback = "") {
  return String(environment[name] || values[name] || fallback).trim();
}

export function loadSigningEnvironment(options = {}) {
  const environment = options.environment || process.env;
  const envFile = options.envFile || signingEnvPath;
  const values = fs.statSync(envFile, { throwIfNoEntry: false })?.isFile()
    ? parseEnv(fs.readFileSync(envFile, "utf8"))
    : {};
  const storePassword = fromEnvironmentOrFile(
    environment,
    values,
    "MULTIAGENT_ANDROID_KEYSTORE_PASSWORD",
  );
  const config = {
    envFile,
    keystorePath: path.resolve(fromEnvironmentOrFile(
      environment,
      values,
      "MULTIAGENT_ANDROID_KEYSTORE_PATH",
      defaultKeystorePath,
    )),
    storePassword,
    keyAlias: fromEnvironmentOrFile(
      environment,
      values,
      "MULTIAGENT_ANDROID_KEY_ALIAS",
      "multiagent",
    ),
    keyPassword: fromEnvironmentOrFile(
      environment,
      values,
      "MULTIAGENT_ANDROID_KEY_PASSWORD",
      storePassword,
    ),
    certificateSha256: fromEnvironmentOrFile(
      environment,
      values,
      "MULTIAGENT_ANDROID_CERT_SHA256",
    ).replace(/[^0-9a-f]/gi, "").toLowerCase(),
  };
  const assignments = {
    MULTIAGENT_ANDROID_KEYSTORE_PATH: config.keystorePath,
    MULTIAGENT_ANDROID_KEYSTORE_PASSWORD: config.storePassword,
    MULTIAGENT_ANDROID_KEY_ALIAS: config.keyAlias,
    MULTIAGENT_ANDROID_KEY_PASSWORD: config.keyPassword,
    MULTIAGENT_ANDROID_CERT_SHA256: config.certificateSha256,
  };
  for (const [name, value] of Object.entries(assignments)) {
    if (value) environment[name] = value;
  }
  return config;
}

function quoteEnv(value) {
  return JSON.stringify(String(value));
}

export function writeSigningFiles(config, certificateSha256) {
  const text = [
    "# Local Android release signing secrets. Never commit or share this file.",
    `MULTIAGENT_ANDROID_KEYSTORE_PATH=${quoteEnv(config.keystorePath)}`,
    `MULTIAGENT_ANDROID_KEYSTORE_PASSWORD=${quoteEnv(config.storePassword)}`,
    `MULTIAGENT_ANDROID_KEY_ALIAS=${quoteEnv(config.keyAlias)}`,
    `MULTIAGENT_ANDROID_KEY_PASSWORD=${quoteEnv(config.keyPassword)}`,
    `MULTIAGENT_ANDROID_CERT_SHA256=${quoteEnv(certificateSha256)}`,
    "",
  ].join("\n");
  fs.writeFileSync(config.envFile, text, { encoding: "utf8", mode: 0o600 });
  fs.writeFileSync(signingPublicMetadataPath, `${JSON.stringify({
    certificateSha256,
    apkPath: path.join(mobileRoot, "android", "app", "build", "outputs", "apk", "release", "app-release.apk"),
  }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

export function findKeytool() {
  const executable = process.platform === "win32" ? "keytool.exe" : "keytool";
  const candidates = [];
  if (process.env.JAVA_HOME) candidates.push(path.join(process.env.JAVA_HOME, "bin", executable));
  const localRoot = path.resolve(mobileRoot, "..", ".build-tools", "jdk17-dist");
  candidates.push(path.join(localRoot, "bin", executable));
  if (fs.statSync(localRoot, { throwIfNoEntry: false })?.isDirectory()) {
    for (const entry of fs.readdirSync(localRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) candidates.push(path.join(localRoot, entry.name, "bin", executable));
    }
  }
  return candidates.find((candidate) => fs.existsSync(candidate)) || executable;
}

export function runKeytool(keytool, args, options = {}) {
  const result = spawnSync(keytool, args, {
    env: process.env,
    encoding: options.binary ? null : "utf8",
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
    stdio: options.inherit ? "inherit" : "pipe",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(String(result.stderr || result.stdout || "keytool failed").trim());
  }
  return result.stdout;
}

export function readCertificateSha256(keytool, config) {
  const certificate = runKeytool(keytool, [
    "-exportcert",
    "-keystore", config.keystorePath,
    "-storetype", "PKCS12",
    "-alias", config.keyAlias,
    "-storepass:env", "MULTIAGENT_ANDROID_KEYSTORE_PASSWORD",
  ], { binary: true });
  return new X509Certificate(certificate).fingerprint256.replace(/:/g, "").toLowerCase();
}
