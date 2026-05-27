import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = new URL("..", import.meta.url).pathname;
const workspace = await mkdtemp(join(tmpdir(), "persistly-sdk-consumer-"));
const packOutput = await execFileAsync("npm", ["pack", "--ignore-scripts", "--pack-destination", workspace], {
  cwd: repoRoot,
});
const tarball = packOutput.stdout.trim().split(/\s+/).at(-1);

if (!tarball) {
  throw new Error("npm pack did not produce a tarball.");
}

await writeFile(join(workspace, "package.json"), JSON.stringify({ type: "module", private: true }, null, 2));
await execFileAsync("npm", ["install", join(workspace, tarball), "typescript@latest"], { cwd: workspace });
await writeFile(
  join(workspace, "smoke.ts"),
  `import {
  LocalStorageSaveCache,
  PersistlyClient,
  PersistlyGameSaveStatus,
  PersistlyGameSaves,
  PersistlySyncStatus,
} from "@persistlyapp/sdk";
import type { SyncPolicy } from "@persistlyapp/sdk/client";
import type { PersistlyErrorPayload } from "@persistlyapp/sdk";
import type { JsonObject, SaveSnapshot } from "@persistlyapp/sdk/cache";
import type { RuntimeConfig } from "@persistlyapp/sdk/client";
import type { LocalStorageLike } from "@persistlyapp/sdk/local-storage-cache";

const policy: SyncPolicy = {
  minRemoteSyncIntervalSeconds: 60,
  forceSyncCooldownSeconds: 10,
  syncOnAppBackground: true,
  syncOnAppForeground: false,
  syncOnReconnect: true,
  maxQueuedLocalSnapshots: 10,
};

const snapshot: SaveSnapshot = {
  saveId: "sv_smoke",
  playerRef: "smoke-player",
  metadata: {},
  state: {},
  version: 1,
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
};
const object: JsonObject = { ok: true };
const errorPayload: PersistlyErrorPayload = { error: { code: "invalid_request", message: "smoke" } };
const runtimeConfig: RuntimeConfig | undefined = undefined;
const localStorageLike: LocalStorageLike | undefined = undefined;

void policy;
void snapshot;
void object;
void errorPayload;
void runtimeConfig;
void localStorageLike;
void PersistlyClient;
void PersistlyGameSaves;
void LocalStorageSaveCache;
void PersistlyGameSaveStatus.Synced;
void PersistlySyncStatus.Accepted;
`,
);
const subpaths = [
  "@persistlyapp/sdk/autosave",
  "@persistlyapp/sdk/cache",
  "@persistlyapp/sdk/client",
  "@persistlyapp/sdk/file-cache",
  "@persistlyapp/sdk/game-saves",
  "@persistlyapp/sdk/local-storage-cache",
  "@persistlyapp/sdk/profile",
  "@persistlyapp/sdk/schema",
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
await execFileAsync("node", ["--input-type=module", "-e", "import('@persistlyapp/sdk').then((sdk) => console.log(Object.keys(sdk).length > 0 ? 'package consumer smoke ok' : 'empty exports'))"], {
  cwd: workspace,
  encoding: "utf8",
});

console.log("Package consumer smoke passed.");
