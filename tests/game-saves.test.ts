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
