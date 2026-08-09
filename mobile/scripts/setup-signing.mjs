import fs from "node:fs";
import path from "node:path";
import {
  findKeytool,
  loadSigningEnvironment,
  mobileRoot,
  readCertificateSha256,
  runKeytool,
  signingEnvPath,
  writeSigningFiles,
} from "./signing-config.mjs";

const config = loadSigningEnvironment();
if (!fs.existsSync(signingEnvPath)) {
  console.error(`Create ${path.relative(mobileRoot, signingEnvPath)} and enter the signing password first.`);
  process.exit(2);
}
if (
  config.storePassword.length < 20
  || /^(replace|change|password)/i.test(config.storePassword)
) {
  console.error("MULTIAGENT_ANDROID_KEYSTORE_PASSWORD must be a real password of at least 20 characters.");
  process.exit(2);
}
if (config.keyPassword !== config.storePassword) {
  console.error("The local PKCS12 setup expects the key password to match the keystore password.");
  process.exit(2);
}
const relativeKeystore = path.relative(mobileRoot, config.keystorePath);
const keystoreInsideRepository = relativeKeystore === ""
  || (!relativeKeystore.startsWith(`..${path.sep}`) && relativeKeystore !== ".." && !path.isAbsolute(relativeKeystore));
if (keystoreInsideRepository) {
  console.error("The release keystore must be stored outside the repository.");
  process.exit(2);
}

const keytool = findKeytool();
if (!fs.existsSync(config.keystorePath)) {
  fs.mkdirSync(path.dirname(config.keystorePath), { recursive: true, mode: 0o700 });
  runKeytool(keytool, [
    "-genkeypair",
    "-noprompt",
    "-storetype", "PKCS12",
    "-keystore", config.keystorePath,
    "-alias", config.keyAlias,
    "-keyalg", "RSA",
    "-keysize", "4096",
    "-validity", "36500",
    "-dname", "CN=MultiAgent,O=OneThingChanged,C=KR",
    "-storepass:env", "MULTIAGENT_ANDROID_KEYSTORE_PASSWORD",
    "-keypass:env", "MULTIAGENT_ANDROID_KEY_PASSWORD",
  ], { inherit: true });
}

const certificateSha256 = readCertificateSha256(keytool, config);
writeSigningFiles(config, certificateSha256);
console.log(`[android-signing] ready: ${config.keystorePath}`);
console.log(`[android-signing] certificate: ${certificateSha256.slice(0, 12)}…`);
console.log("[android-signing] back up the keystore and password separately before publishing.");
