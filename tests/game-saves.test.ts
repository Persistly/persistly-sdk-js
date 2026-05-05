import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import {
  PersistlyGameSaves,
  PersistlyGameSavesInstance,
  PersistlySlotStatus,
} from "../src/index.ts";

const execFileAsync = promisify(execFile);

class FakeStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

test("exports stable slot status constants", () => {
  assert.equal(PersistlySlotStatus.LocalSaved, "local_saved");
  assert.equal(PersistlySlotStatus.Synced, "synced");
  assert.equal(PersistlySlotStatus.Conflict, "conflict");
  assert.equal(PersistlySlotStatus.Offline, "offline");
  assert.equal(PersistlySlotStatus.RateLimited, "rate_limited");
});

test("shared facade fails clearly before configure", async () => {
  await assert.rejects(
    () => PersistlyGameSaves.shared.loadSlot("autosave"),
    /not_configured/,
  );
});

test("start returns a configured facade instance", async () => {
  const persistly = await PersistlyGameSaves.start({
    runtimeKey: "ps_test_example",
    storage: "memory",
    syncIntervalSeconds: 40,
  });

  assert.equal(typeof persistly.saveSlot, "function");
  assert.equal(typeof persistly.loadSlot, "function");
  assert.equal(typeof persistly.forceSync, "function");
});

test("configure replaces shared with a configured facade", async () => {
  await PersistlyGameSaves.configure({
    runtimeKey: "ps_test_example",
    storage: "memory",
  });

  assert.equal(typeof PersistlyGameSaves.shared.saveSlot, "function");
});

test("configured facade stores local slot state", async () => {
  const persistly = await PersistlyGameSaves.start({
    runtimeKey: "ps_test_example",
    storage: "memory",
  });

  await persistly.saveSlot("autosave", { coins: 42 });
  const slot = await persistly.loadSlot("autosave");

  assert.equal(slot?.slotKey, "autosave");
  assert.deepEqual(slot?.dirtyState, { coins: 42 });
});

test("memory storage does not persist slot state across facade instances", async () => {
  const first = await PersistlyGameSaves.start({
    runtimeKey: "ps_test_example",
    storage: "memory",
  });

  await first.saveSlot("autosave", { coins: 42 });

  const second = await PersistlyGameSaves.start({
    runtimeKey: "ps_test_example",
    storage: "memory",
  });

  assert.equal(await second.loadSlot("autosave"), undefined);
});

test("localStorage storage persists slot state across facade instances", async () => {
  const storage = new FakeStorage();
  const first = new PersistlyGameSavesInstance(
    {
      runtimeKey: "ps_test_example",
      storage: "localStorage",
    },
    { storage },
  );

  await first.saveSlot("autosave", { coins: 42 });

  const second = new PersistlyGameSavesInstance(
    {
      runtimeKey: "ps_test_example",
      storage: "localStorage",
    },
    { storage },
  );

  const slot = await second.loadSlot("autosave");

  assert.equal(slot?.slotKey, "autosave");
  assert.deepEqual(slot?.dirtyState, { coins: 42 });
});

test("localStorage storage fails clearly when no Storage implementation is available", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: undefined,
  });

  try {
    assert.throws(
      () =>
        new PersistlyGameSavesInstance({
          runtimeKey: "ps_test_example",
          storage: "localStorage",
        }),
      /localStorage/,
    );
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, "localStorage", descriptor);
    } else {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  }
});

test("saveSlot writes local state and returns LocalSaved constant value", async () => {
  const persistly = await PersistlyGameSaves.start({
    runtimeKey: "ps_test_example",
    storage: "memory",
  });

  const result = await persistly.saveSlot("autosave", { coins: 42 });

  assert.equal(result.status, PersistlySlotStatus.LocalSaved);
  assert.equal(result.slotKey, "autosave");
});

test("forceSync returns Synced for dirty local state", async () => {
  const persistly = await PersistlyGameSaves.start({
    runtimeKey: "ps_test_example",
    storage: "memory",
  });

  await persistly.saveSlot("autosave", { coins: 42 });
  const result = await persistly.forceSync("autosave");

  assert.equal(result.status, PersistlySlotStatus.Synced);
  assert.equal(result.slotKey, "autosave");
});

test("forceSync maps rate errors to RateLimited for dirty local state", async () => {
  const persistly = new PersistlyGameSavesInstance(
    {
      runtimeKey: "ps_test_example",
      storage: "memory",
    },
    {
      syncSlot: async () => {
        throw new Error("rate limited");
      },
    },
  );

  await persistly.saveSlot("autosave", { coins: 42 });
  const result = await persistly.forceSync("autosave");

  assert.equal(result.status, PersistlySlotStatus.RateLimited);
  assert.equal(result.slotKey, "autosave");
});

test("forceSync maps network and offline errors to Offline for dirty local state", async () => {
  for (const message of ["network unavailable", "offline"]) {
    const persistly = new PersistlyGameSavesInstance(
      {
        runtimeKey: "ps_test_example",
        storage: "memory",
      },
      {
        syncSlot: async () => {
          throw new Error(message);
        },
      },
    );

    await persistly.saveSlot("autosave", { coins: 42 });
    const result = await persistly.forceSync("autosave");

    assert.equal(result.status, PersistlySlotStatus.Offline);
    assert.equal(result.slotKey, "autosave");
  }
});

test("conflict helper methods are present on facade", async () => {
  const persistly = await PersistlyGameSaves.start({
    runtimeKey: "ps_test_example",
    storage: "memory",
  });

  assert.equal(typeof persistly.acceptCloudVersion, "function");
  assert.equal(typeof persistly.overwriteCloudVersion, "function");
  assert.equal(typeof persistly.keepLocalForLater, "function");
});

test("public game saves config rejects syncSlot", async () => {
  const directory = await mkdtemp(join(tmpdir(), "persistly-game-saves-types-"));
  const typecheckFile = join(directory, "sync-slot-config.ts");

  await writeFile(
    typecheckFile,
    `
      import type { PersistlyGameSavesConfig } from "${process.cwd()}/src/index.ts";

      const config: PersistlyGameSavesConfig = {
        runtimeKey: "ps_test_example",
        storage: "memory",
        // @ts-expect-error syncSlot must stay out of the public config type.
        syncSlot: async () => ({ ok: true }),
      };

      void config;
    `,
  );

  try {
    await execFileAsync("pnpm", [
      "exec",
      "tsc",
      "--noEmit",
      "--pretty",
      "false",
      "--strict",
      "--exactOptionalPropertyTypes",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--target",
      "ES2022",
      "--types",
      "node",
      "--allowImportingTsExtensions",
      typecheckFile,
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
