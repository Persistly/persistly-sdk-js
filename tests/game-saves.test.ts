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

const syncPolicy = {
  minRemoteSyncIntervalSeconds: 60,
  forceSyncCooldownSeconds: 10,
  syncOnAppBackground: true,
  syncOnAppForeground: true,
  syncOnReconnect: true,
  maxQueuedLocalSnapshots: 10,
};

test("createTransferCode requires a local account session", async () => {
  const persistly = new PersistlyGameSavesInstance({
    runtimeKey: "ps_test_runtime",
    storage: "memory",
    fetch: async () => {
      throw new Error("createTransferCode should fail before network without a session");
    },
  });

  await assert.rejects(
    () => persistly.createTransferCode(),
    /requires accountId and accountSessionToken/i,
  );
});

test("attachWithTransferCode consumes the code and stores the returned account session", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const persistly = new PersistlyGameSavesInstance({
    runtimeKey: "ps_test_runtime",
    storage: "memory",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return new Response(JSON.stringify({
        accountId: "acc_transfer",
        accountSessionToken: "pst_transfer_session",
        account: {
          accountId: "acc_transfer",
          accountData: { diamonds: 10 },
          slots: [{ slotId: "autosave", slotInfo: { level: 12 }, version: 4 }],
          version: 2,
        },
        syncPolicy,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const attached = await persistly.attachWithTransferCode("P7K2D-M9Q4R", {
    deviceLabel: "Laptop",
  });
  const session = await persistly.getAccountSession({ includeToken: true });
  const account = await persistly.getAccountInfo();

  assert.equal(attached.status, PersistlyGameSaveStatus.Synced);
  assert.equal(attached.accountId, "acc_transfer");
  assert.deepEqual(session, {
    accountId: "acc_transfer",
    accountSessionToken: "pst_transfer_session",
  });
  assert.equal(account.version, 2);
  assert.deepEqual(account.accountData, { diamonds: 10 });
  assert.equal(requests[0]?.url, "https://api.persistly.app/api/v1/account-transfer-codes/consume");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    transferCode: "P7K2D-M9Q4R",
    deviceLabel: "Laptop",
  });
});

test("attachWithTransferCode refuses non-empty local account state", async () => {
  const persistly = new PersistlyGameSavesInstance({
    runtimeKey: "ps_test_runtime",
    storage: "memory",
    fetch: async () => {
      throw new Error("attachWithTransferCode should fail before network when local state exists");
    },
  });

  await persistly.saveData({ level: 2 });

  await assert.rejects(
    () => persistly.attachWithTransferCode("P7K2D-M9Q4R"),
    /requires empty local account state/i,
  );
});
