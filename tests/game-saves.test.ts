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
