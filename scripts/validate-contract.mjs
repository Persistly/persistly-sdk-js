import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const preferredBundleRoot = path.join(repoRoot, "contracts", "persistly-contract-v0.4.0");
const fallbackBundleRoot = path.join(repoRoot, "contracts", "persistly-contract-v0.3.0");
const bundleRoot = await directoryExists(preferredBundleRoot) ? preferredBundleRoot : fallbackBundleRoot;
const manifestPath = path.join(bundleRoot, "manifest.json");
const expectedBundle = path.basename(bundleRoot);
const expectedVersion = expectedBundle.replace("persistly-contract-", "");
const expectedSchemaVersion = 1;
const expectedExampleSet = "strict";
const requiredPaths = new Set([
  "openapi/persistly-api.yaml",
  "limits/runtime-limits.json",
  "examples/create-save.json",
  "examples/sync-save.json",
  "examples/save-response.json",
  "examples/conflict-response.json",
  "examples/error-response.json",
]);

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

if (manifest.schemaVersion !== expectedSchemaVersion) {
  throw new Error(`Contract manifest schemaVersion must be ${expectedSchemaVersion}.`);
}

if (manifest.bundle !== expectedBundle) {
  throw new Error(`Contract manifest bundle must be ${expectedBundle}.`);
}

if (manifest.version !== expectedVersion) {
  throw new Error(`Contract manifest version must be ${expectedVersion}.`);
}

if (manifest.exampleSet !== expectedExampleSet) {
  throw new Error(`Contract manifest exampleSet must be ${expectedExampleSet}.`);
}

if (!Array.isArray(manifest.files)) {
  throw new Error("Contract manifest must contain a files array.");
}

const listedPaths = new Set();

for (const file of manifest.files) {
  if (!file || typeof file !== "object") {
    throw new Error("Every contract manifest file entry must be an object.");
  }

  const { path: relativePath, sha256, bytes } = file;

  if (typeof relativePath !== "string") {
    throw new Error("Every contract manifest file entry must include a string path.");
  }

  if (typeof sha256 !== "string" || typeof bytes !== "number") {
    throw new Error(`Manifest entry ${relativePath} must include sha256 and bytes metadata.`);
  }

  listedPaths.add(relativePath);

  const absolutePath = path.join(bundleRoot, relativePath);
  const contents = await readFile(absolutePath);
  const digest = createHash("sha256").update(contents).digest("hex");

  if (digest !== sha256) {
    throw new Error(`Hash mismatch for ${relativePath}.`);
  }

  if (contents.byteLength !== bytes) {
    throw new Error(`Byte-size mismatch for ${relativePath}.`);
  }
}

for (const requiredPath of requiredPaths) {
  if (!listedPaths.has(requiredPath)) {
    throw new Error(`Contract manifest is missing required path ${requiredPath}.`);
  }
}

const discoveredFiles = new Set(await listBundleFiles(bundleRoot));
const expectedFiles = new Set(["manifest.json", ...listedPaths]);
const unexpectedFiles = [...discoveredFiles].filter((file) => !expectedFiles.has(file)).sort();

if (unexpectedFiles.length > 0) {
  throw new Error(`Contract bundle contains unexpected files: ${unexpectedFiles.join(", ")}`);
}

if (expectedBundle === "persistly-contract-v0.4.0") {
  const openapi = await readFile(path.join(bundleRoot, "openapi", "persistly-api.yaml"), "utf8");
  for (const accountPath of ["/api/v1/accounts", "/api/v1/accounts/{accountId}/slots/{slotId}/sync"]) {
    if (!openapi.includes(accountPath)) {
      throw new Error(`Contract OpenAPI is missing account path ${accountPath}.`);
    }
  }
  if (openapi.includes("/api/v1/profiles") || openapi.includes("X-Persistly-Profile-Session")) {
    throw new Error("Contract OpenAPI must not expose profile routes or profile session headers.");
  }
} else {
  console.warn("Contract bundle persistly-contract-v0.4.0 is not present; validated existing v0.3.0 bundle integrity only.");
}

console.log(`Contract bundle ${expectedBundle} is present and matches manifest integrity metadata.`);

async function listBundleFiles(root, relativePath = "") {
  const entries = await readdir(path.join(root, relativePath), { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryRelativePath = path.posix.join(relativePath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listBundleFiles(root, entryRelativePath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(entryRelativePath);
    }
  }

  return files;
}

async function directoryExists(directory) {
  try {
    await readdir(directory);
    return true;
  } catch {
    return false;
  }
}
