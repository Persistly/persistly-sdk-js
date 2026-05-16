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

const policy: SyncPolicy = {
  minRemoteSyncIntervalSeconds: 60,
  forceSyncCooldownSeconds: 10,
  syncOnAppBackground: true,
  syncOnAppForeground: false,
  syncOnReconnect: true,
  maxQueuedLocalSnapshots: 10,
};

void policy;
void PersistlyClient;
void PersistlyGameSaves;
void LocalStorageSaveCache;
void PersistlyGameSaveStatus.Synced;
void PersistlySyncStatus.Accepted;
`,
);
await execFileAsync(
  join(workspace, "node_modules", ".bin", "tsc"),
  ["smoke.ts", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2022", "--noEmit", "--strict"],
  { cwd: workspace },
);
await execFileAsync("node", ["--input-type=module", "-e", "import('@persistlyapp/sdk').then((sdk) => console.log(Object.keys(sdk).length > 0 ? 'package consumer smoke ok' : 'empty exports'))"], {
  cwd: workspace,
  encoding: "utf8",
});

console.log("Package consumer smoke passed.");
