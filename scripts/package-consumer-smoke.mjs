import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = new URL("..", import.meta.url).pathname;
const workspace = await mkdtemp(join(tmpdir(), "persistly-sdk-consumer-"));
const npmEnv = createNestedNpmEnv();
const packOutput = await execFileAsync("npm", ["pack", "--ignore-scripts", "--pack-destination", workspace], {
  cwd: repoRoot,
  env: npmEnv,
});
const tarball = resolvePackedTarball(packOutput.stdout);

if (!tarball) {
  throw new Error("npm pack did not produce a tarball.");
}

await writeFile(join(workspace, "package.json"), JSON.stringify({ type: "module", private: true }, null, 2));
await execFileAsync("npm", ["install", join(workspace, tarball), "typescript@latest"], { cwd: workspace, env: npmEnv });
await writeFile(
  join(workspace, "smoke.ts"),
`import {
  PersistlyClient,
  PersistlyGameSaveStatus,
  PersistlyGameSaves,
  PersistlySyncStatus,
} from "@persistlyapp/sdk";
import type { SyncPolicy } from "@persistlyapp/sdk/client";
import type { PersistlyErrorPayload } from "@persistlyapp/sdk";
import type { RuntimeConfig } from "@persistlyapp/sdk/client";
import type { PersistlyAccountState } from "@persistlyapp/sdk/account";

const policy: SyncPolicy = {
  minRemoteSyncIntervalSeconds: 60,
  forceSyncCooldownSeconds: 10,
  syncOnAppBackground: true,
  syncOnAppForeground: false,
  syncOnReconnect: true,
  maxQueuedLocalSnapshots: 10,
};

const errorPayload: PersistlyErrorPayload = { error: { code: "invalid_request", message: "smoke" } };
const runtimeConfig: RuntimeConfig | undefined = undefined;
const accountState: PersistlyAccountState | undefined = undefined;

void policy;
void errorPayload;
void runtimeConfig;
void accountState;
void PersistlyClient;
void PersistlyGameSaves;
void PersistlyGameSaveStatus.Synced;
void PersistlySyncStatus.Accepted;
`,
);
const subpaths = [
  "@persistlyapp/sdk/account",
  "@persistlyapp/sdk/autosave",
  "@persistlyapp/sdk/client",
  "@persistlyapp/sdk/game-saves",
];
await writeFile(
  join(workspace, "subpaths.mjs"),
  `${subpaths.map((specifier) => `import("${specifier}")`).join(";\n")};\n`,
);
await execFileAsync(
  join(workspace, "node_modules", ".bin", "tsc"),
  ["smoke.ts", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2022", "--noEmit", "--strict"],
  { cwd: workspace },
);
await execFileAsync("node", ["subpaths.mjs"], {
  cwd: workspace,
  encoding: "utf8",
});
await writeFile(
  join(workspace, "private-subpaths.mjs"),
  `const privateSubpaths = [
  "@persistlyapp/sdk/cache",
  "@persistlyapp/sdk/file-cache",
  "@persistlyapp/sdk/local-storage-cache",
  "@persistlyapp/sdk/schema",
];

for (const specifier of privateSubpaths) {
  try {
    await import(specifier);
    throw new Error(specifier + " should not be exported");
  } catch (error) {
    if (!String(error).includes("Package subpath")) {
      throw error;
    }
  }
}
`,
);
await execFileAsync("node", ["private-subpaths.mjs"], {
  cwd: workspace,
  encoding: "utf8",
});
await execFileAsync("node", ["--input-type=module", "-e", "import('@persistlyapp/sdk').then((sdk) => console.log(Object.keys(sdk).length > 0 ? 'package consumer smoke ok' : 'empty exports'))"], {
  cwd: workspace,
  encoding: "utf8",
});

console.log("Package consumer smoke passed.");

function createNestedNpmEnv() {
  const env = { ...process.env };
  delete env.npm_config_dry_run;
  delete env.npm_config_json;
  delete env.npm_config_ignore_scripts;
  return env;
}

function resolvePackedTarball(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed) && typeof parsed[0]?.filename === "string") {
      return parsed[0].filename;
    }
  } catch {
    // npm usually prints the tarball path as plain text. JSON mode is inherited in some npm lifecycle contexts.
  }

  return trimmed.split(/\s+/).at(-1);
}
