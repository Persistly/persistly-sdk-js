import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_PERSISTLY_API_BASE_URL,
  MemorySaveCache,
  PersistlyAccountDeletedError,
  PersistlyClient,
  PersistlySlotArchivedError,
  PersistlySlotDeletedError,
  PersistlySyncStatus,
} from "../src/index.js";

function createJsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const syncPolicy = {
  minRemoteSyncIntervalSeconds: 60,
  forceSyncCooldownSeconds: 10,
  syncOnAppBackground: true,
  syncOnAppForeground: true,
  syncOnReconnect: true,
  maxQueuedLocalSnapshots: 10,
};

test("createAccount posts account-first payload and session header routes are account-first", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return createJsonResponse(201, {
        accountId: "acc_test",
        accountSessionToken: "pst_session",
        account: {
          accountId: "acc_test",
          accountData: { diamonds: 0 },
          slots: [{ slotId: "autosave", slotInfo: { characterName: "Ayla" }, version: 1 }],
          version: 1,
        },
        slot: {
          slotId: "autosave",
          slotInfo: { characterName: "Ayla" },
          data: { level: 1 },
          version: 1,
        },
        syncPolicy,
      });
    },
  });

  const created = await client.createAccount({
    playerRef: "player-184",
    externalAccountRef: { provider: "auth0", subject: "auth0|abc123" },
    accountData: { diamonds: 0 },
    slot: {
      slotId: "autosave",
      slotInfo: { characterName: "Ayla" },
      data: { level: 1 },
    },
  });

  assert.equal(created.accountId, "acc_test");
  assert.equal(created.accountSessionToken, "pst_session");
  assert.equal(created.slot?.slotId, "autosave");
  assert.equal(requests[0]?.url, `${DEFAULT_PERSISTLY_API_BASE_URL}/api/v1/accounts`);
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    playerRef: "player-184",
    externalAccountRef: { provider: "auth0", subject: "auth0|abc123" },
    accountData: { diamonds: 0 },
    slot: {
      slotId: "autosave",
      slotInfo: { characterName: "Ayla" },
      data: { level: 1 },
    },
  });
});

test("syncAccountSlot uses account session header and synthesizes accepted slot saves", async () => {
  const cache = new MemorySaveCache();
  await cache.set({
    saveId: "acc_test:autosave",
    playerRef: null,
    metadata: { characterName: "Ayla" },
    state: { level: 1 },
    version: 3,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
  });

  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    cache,
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return createJsonResponse(200, {
        status: "accepted",
        version: 4,
        updatedAt: "2026-05-01T00:01:00.000Z",
        historyRetained: true,
      });
    },
  });

  const result = await client.syncAccountSlot({
    accountId: "acc_test",
    accountSessionToken: "pst_session",
    slotId: "autosave",
    data: { level: 2 },
    slotInfo: { characterName: "Ayla" },
  });

  assert.equal(result.status, PersistlySyncStatus.Accepted);
  assert.equal(result.save.saveId, "acc_test:autosave");
  assert.deepEqual(result.save.state, { level: 2 });
  assert.equal(requests[0]?.url, `${DEFAULT_PERSISTLY_API_BASE_URL}/api/v1/accounts/acc_test/slots/autosave/sync`);
  assert.equal(new Headers(requests[0]?.init?.headers).get("x-persistly-account-session"), "pst_session");
});

test("account and slot error codes map to account-first error classes", async () => {
  assert.ok(new PersistlyAccountDeletedError("deleted") instanceof Error);
  assert.ok(new PersistlySlotDeletedError("deleted") instanceof Error);
  assert.ok(new PersistlySlotArchivedError("archived") instanceof Error);
});
