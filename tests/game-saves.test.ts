import test from "node:test";
import assert from "node:assert/strict";

import {
  PersistlyDefaultSlotKey,
  PersistlyGameSaveStatus,
  PersistlyGameSaveTarget,
  PersistlyGameSaves,
  PersistlyGameSavesInstance,
} from "../src/index.js";

test("exports account-first high-level status and target constants", () => {
  assert.equal(PersistlyGameSaveStatus.Synced, "synced");
  assert.equal(PersistlyGameSaveTarget.Account, "account");
  assert.equal(PersistlyGameSaveTarget.Slot, "slot");
  assert.equal(PersistlyDefaultSlotKey, "autosave");
});

test("saveData and loadData keep default autosave slot behavior with slotInfo", async () => {
  const persistly = new PersistlyGameSavesInstance({
    runtimeKey: "ps_test_runtime",
    storage: "memory",
    fetch: async () => {
      throw new Error("local save/load should not hit the network");
    },
  });

  const saved = await persistly.saveData({ level: 2 }, {
    slotInfo: { characterName: "Ayla" },
  });
  const loaded = await persistly.loadData();

  assert.equal(saved.status, PersistlyGameSaveStatus.LocalSaved);
  assert.equal(saved.slotId, "autosave");
  assert.equal(loaded.status, PersistlyGameSaveStatus.LocalFound);
  assert.equal(loaded.slotId, "autosave");
  assert.equal(loaded.slotKey, "autosave");
  assert.deepEqual(loaded.data, { level: 2 });
  assert.deepEqual(loaded.state, { level: 2 });
  assert.deepEqual(loaded.slotInfo, { characterName: "Ayla" });
  assert.deepEqual(loaded.metadata, { characterName: "Ayla" });
});

test("shared facade fails clearly before configure", async () => {
  await assert.rejects(
    () => PersistlyGameSaves.shared.saveData({ level: 1 }),
    /configure/i,
  );
});
