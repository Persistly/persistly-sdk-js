import test from "node:test";
import assert from "node:assert/strict";

import {
  MemoryAutosaveDraftStore,
  PersistlyAutosaveManager,
  PersistlyClient,
  PersistlySyncStatus,
} from "../src/index.js";
import { MemorySaveCache } from "../src/cache.js";

const syncPolicy = {
  minRemoteSyncIntervalSeconds: 60,
  forceSyncCooldownSeconds: 10,
  syncOnAppBackground: true,
  syncOnAppForeground: true,
  syncOnReconnect: true,
  maxQueuedLocalSnapshots: 10,
};

test("autosave records local drafts with account and slot ids", async () => {
  const store = new MemoryAutosaveDraftStore();
  const manager = new PersistlyAutosaveManager({
    client: new PersistlyClient({
      runtimeKey: "ps_test_runtime",
      fetch: async () => {
        throw new Error("not expected");
      },
    }),
    accountId: "acc_test",
    accountSessionToken: "pst_session",
    slotId: "autosave",
    syncPolicy,
    draftStore: store,
  });

  await manager.recordLocalChange({
    state: { level: 2 },
    metadata: { characterName: "Ayla" },
  });

  assert.deepEqual(await store.get("acc_test", "autosave"), {
    state: { level: 2 },
    metadata: { characterName: "Ayla" },
  });
});

test("autosave forceSync uses account slot sync", async () => {
  const cache = new MemorySaveCache();
  await cache.set({
    saveId: "acc_test:autosave",
    playerRef: null,
    metadata: {},
    state: { level: 1 },
    version: 1,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
  });
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    cache,
    fetch: async () => new Response(JSON.stringify({
      status: "accepted",
      version: 2,
      updatedAt: "2026-05-01T00:00:00.000Z",
      historyRetained: true,
    })),
  });
  const manager = new PersistlyAutosaveManager({
    client,
    accountId: "acc_test",
    accountSessionToken: "pst_session",
    slotId: "autosave",
    syncPolicy,
    draftStore: new MemoryAutosaveDraftStore(),
  });

  await manager.recordLocalChange({ state: { level: 2 } });
  const result = await manager.forceSync();

  assert.equal(result?.status, PersistlySyncStatus.Accepted);
});
