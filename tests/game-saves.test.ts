import assert from "node:assert/strict";
import test from "node:test";
import {
  PersistlyGameSaves,
  PersistlySlotStatus,
} from "../src/index.ts";

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
  const persistly = await PersistlyGameSaves.start({
    runtimeKey: "ps_test_example",
    storage: "memory",
    syncSlot: async () => {
      throw new Error("rate limited");
    },
  });

  await persistly.saveSlot("autosave", { coins: 42 });
  const result = await persistly.forceSync("autosave");

  assert.equal(result.status, PersistlySlotStatus.RateLimited);
  assert.equal(result.slotKey, "autosave");
});

test("forceSync maps network and offline errors to Offline for dirty local state", async () => {
  for (const message of ["network unavailable", "offline"]) {
    const persistly = await PersistlyGameSaves.start({
      runtimeKey: "ps_test_example",
      storage: "memory",
      syncSlot: async () => {
        throw new Error(message);
      },
    });

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
