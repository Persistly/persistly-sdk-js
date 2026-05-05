import test from "node:test";
import assert from "node:assert/strict";

import {
  MemoryAutosaveDraftStore,
  PersistlyAutosaveManager,
  PersistlyClient,
  PersistlySyncStatus,
  LocalStorageAutosaveDraftStore,
  type JsonObject,
  type LocalStorageLike,
  type SyncPolicy,
} from "../src/index.js";

const syncPolicy: SyncPolicy = {
  minRemoteSyncIntervalSeconds: 40,
  forceSyncCooldownSeconds: 10,
  syncOnAppBackground: true,
  syncOnAppForeground: true,
  syncOnReconnect: true,
  maxQueuedLocalSnapshots: 25,
};

test("autosave records local drafts immediately and remote-syncs only after policy interval", async () => {
  let now = 0;
  const draftStore = new MemoryAutosaveDraftStore();
  const syncCalls: JsonObject[] = [];
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    fetch: async (_input, init) => {
      syncCalls.push(JSON.parse(String(init?.body)) as JsonObject);
      return new Response(
        JSON.stringify({
          status: "accepted",
          save: {
            saveId: "sv_character",
            playerRef: "player-184",
            metadata: { characterName: "Ayla" },
            state: JSON.parse(String(init?.body)).state,
            version: syncCalls.length + 1,
            createdAt: "2026-04-09T10:00:00Z",
            updatedAt: "2026-04-09T10:01:00Z",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });
  await client.updateLocal({
    saveId: "sv_character",
    playerRef: "player-184",
    metadata: { characterName: "Ayla" },
    state: { level: 1 },
    version: 1,
    createdAt: "2026-04-09T10:00:00Z",
    updatedAt: "2026-04-09T10:00:00Z",
  });
  const autosave = new PersistlyAutosaveManager({
    client,
    draftStore,
    syncPolicy,
    profileSaveId: "sv_profile",
    characterSaveId: "sv_character",
    profileSessionToken: "pst_session",
    now: () => now,
  });

  await autosave.recordLocalChange({ state: { level: 2 }, metadata: { characterName: "Ayla" } });
  await autosave.tick();
  assert.equal(syncCalls.length, 0);
  assert.deepEqual(await draftStore.get("sv_profile", "sv_character"), {
    state: { level: 2 },
    metadata: { characterName: "Ayla" },
  });

  now = 40_000;
  const result = await autosave.tick();

  assert.equal(result?.status, PersistlySyncStatus.Accepted);
  assert.equal(syncCalls.length, 1);
  assert.deepEqual(syncCalls[0], {
    baseVersion: 1,
    metadata: { characterName: "Ayla" },
    state: { level: 2 },
  });
  assert.equal(await draftStore.get("sv_profile", "sv_character"), null);
});

test("autosave forceSync bypasses interval but respects force cooldown", async () => {
  let now = 0;
  let syncCalls = 0;
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    fetch: async (_input, init) => {
      syncCalls += 1;
      return new Response(
        JSON.stringify({
          status: "accepted",
          save: {
            saveId: "sv_character",
            playerRef: null,
            metadata: JSON.parse(String(init?.body)).metadata ?? {},
            state: JSON.parse(String(init?.body)).state,
            version: syncCalls + 1,
            createdAt: "2026-04-09T10:00:00Z",
            updatedAt: "2026-04-09T10:01:00Z",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });
  await client.updateLocal({
    saveId: "sv_character",
    playerRef: null,
    metadata: {},
    state: { level: 1 },
    version: 1,
    createdAt: "2026-04-09T10:00:00Z",
    updatedAt: "2026-04-09T10:00:00Z",
  });
  const autosave = new PersistlyAutosaveManager({
    client,
    syncPolicy,
    profileSaveId: "sv_profile",
    characterSaveId: "sv_character",
    profileSessionToken: "pst_session",
    now: () => now,
  });

  await autosave.recordLocalChange({ state: { level: 2 } });
  assert.equal((await autosave.forceSync())?.status, PersistlySyncStatus.Accepted);
  await autosave.recordLocalChange({ state: { level: 3 } });
  assert.equal(await autosave.forceSync(), null);

  now = 10_000;
  assert.equal((await autosave.forceSync())?.status, PersistlySyncStatus.Accepted);
  assert.equal(syncCalls, 2);
});

test("LocalStorageAutosaveDraftStore persists drafts across instances", async () => {
  const storage = new MemoryStorage();
  const firstStore = new LocalStorageAutosaveDraftStore({ storage });

  await firstStore.set("sv_profile", "sv_character", {
    state: { level: 4 },
    metadata: { characterName: "Ayla" },
  });

  const secondStore = new LocalStorageAutosaveDraftStore({ storage });
  assert.deepEqual(await secondStore.get("sv_profile", "sv_character"), {
    state: { level: 4 },
    metadata: { characterName: "Ayla" },
  });

  await secondStore.clear("sv_profile", "sv_character");
  assert.equal(await firstStore.get("sv_profile", "sv_character"), null);
});

class MemoryStorage implements LocalStorageLike {
  private readonly items = new Map<string, string>();

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }
}
