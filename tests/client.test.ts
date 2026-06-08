import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_PERSISTLY_API_BASE_URL,
  PersistlyAccountDeletedError,
  PersistlyClient,
  PersistlySlotArchivedError,
  PersistlySlotDeletedError,
  PersistlySyncStatus,
} from "../src/index.js";
import { MemorySaveCache } from "../src/cache.js";

function createJsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requestJsonBody(request: { init?: RequestInit } | undefined): Record<string, unknown> {
  assert.ok(request?.init?.body);
  const body = JSON.parse(String(request.init.body)) as Record<string, unknown>;
  assert.equal("metadata" in body, false);
  assert.equal("state" in body, false);
  return body;
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
  assert.deepEqual(requestJsonBody(requests[0]), {
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

test("createAccountSlot sends slotInfo and data without metadata or state", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return createJsonResponse(201, {
        accountId: "acc_test",
        account: {
          accountId: "acc_test",
          accountData: {},
          slots: [{ slotId: "manual-1", slotInfo: { label: "Manual 1" }, version: 1 }],
          version: 1,
        },
        slot: {
          slotId: "manual-1",
          slotInfo: { label: "Manual 1" },
          data: { level: 3 },
          version: 1,
          updatedAt: "2026-05-01T00:01:00.000Z",
        },
        syncPolicy,
      });
    },
  });

  const created = await client.createAccountSlot({
    accountId: "acc_test",
    accountSessionToken: "pst_session",
    slotId: "manual-1",
    slotInfo: { label: "Manual 1" },
    data: { level: 3 },
  });

  assert.equal(created.slot.slotId, "manual-1");
  assert.equal(requests[0]?.url, `${DEFAULT_PERSISTLY_API_BASE_URL}/api/v1/accounts/acc_test/slots`);
  assert.equal(new Headers(requests[0]?.init?.headers).get("x-persistly-account-session"), "pst_session");
  assert.deepEqual(requestJsonBody(requests[0]), {
    slotId: "manual-1",
    slotInfo: { label: "Manual 1" },
    data: { level: 3 },
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
  assert.deepEqual(requestJsonBody(requests[0]), {
    baseVersion: 3,
    slotInfo: { characterName: "Ayla" },
    data: { level: 2 },
  });
});

test("syncAccountSlot synthesizes conflict save from public slot response", async () => {
  const cache = new MemorySaveCache();
  await cache.set({
    saveId: "acc_test:autosave",
    playerRef: null,
    metadata: { characterName: "Ayla" },
    state: { level: 1 },
    version: 1,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
  });

  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    cache,
    fetch: async () => createJsonResponse(409, {
      status: "conflict",
      slot: {
        slotId: "autosave",
        slotInfo: { characterName: "Ayla", level: 2 },
        data: { level: 2 },
        version: 2,
        status: "active",
        updatedAt: "2026-05-01T00:01:00.000Z",
      },
      version: 2,
      updatedAt: "2026-05-01T00:01:00.000Z",
      details: {
        reason: "base_version_mismatch",
        serverSlot: {
          slotInfo: { characterName: "Ayla", level: 2 },
          data: { level: 2 },
        },
        clientSlot: {
          slotInfo: { characterName: "Ayla", level: 99 },
          data: { level: 99 },
        },
      },
    }),
  });

  const result = await client.syncAccountSlot({
    accountId: "acc_test",
    accountSessionToken: "pst_session",
    slotId: "autosave",
    baseVersion: 1,
    slotInfo: { characterName: "Ayla", level: 99 },
    data: { level: 99 },
  });

  assert.equal(result.status, PersistlySyncStatus.Conflict);
  assert.equal(result.save.saveId, "acc_test:autosave");
  assert.equal(result.save.version, 2);
  assert.deepEqual(result.save.state, { level: 2 });
});

test("syncAccountData uses the account data sync route and account session header", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return createJsonResponse(200, {
        status: "accepted",
        version: 5,
        updatedAt: "2026-05-01T00:02:00.000Z",
        historyRetained: true,
        account: {
          accountId: "acc_test",
          accountData: { diamonds: 50 },
          slots: [],
          version: 5,
        },
      });
    },
  });

  const result = await client.syncAccountData({
    accountId: "acc_test",
    accountSessionToken: "pst_session",
    accountData: { diamonds: 50 },
    baseVersion: 4,
  });

  assert.equal(result.status, PersistlySyncStatus.Accepted);
  assert.equal(requests[0]?.url, `${DEFAULT_PERSISTLY_API_BASE_URL}/api/v1/accounts/acc_test/data/sync`);
  assert.equal(new Headers(requests[0]?.init?.headers).get("x-persistly-account-session"), "pst_session");
  assert.deepEqual(requestJsonBody(requests[0]), {
    baseVersion: 4,
    accountData: { diamonds: 50 },
  });
});

test("syncAccountData sends accountDataPatch without metadata or state", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return createJsonResponse(200, {
        status: "accepted",
        version: 6,
        updatedAt: "2026-05-01T00:03:00.000Z",
        historyRetained: true,
      });
    },
  });

  const result = await client.syncAccountData({
    accountId: "acc_test",
    accountSessionToken: "pst_session",
    accountDataPatch: { diamonds: 75 },
    baseVersion: 5,
  });

  assert.equal(result.status, PersistlySyncStatus.Accepted);
  assert.equal(requests[0]?.url, `${DEFAULT_PERSISTLY_API_BASE_URL}/api/v1/accounts/acc_test/data/sync`);
  assert.deepEqual(requestJsonBody(requests[0]), {
    baseVersion: 5,
    accountDataPatch: { diamonds: 75 },
  });
});

test("createTransferCode posts to the account transfer-code route with the account session header", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return createJsonResponse(201, {
        transferCode: "P7K2D-M9Q4R",
        expiresAt: "2026-06-01T12:10:00.000Z",
        expiresInSeconds: 600,
      });
    },
  });

  const created = await client.createTransferCode({
    accountId: "acc_test",
    accountSessionToken: "pst_session",
    deviceLabel: "Browser",
    ttlSeconds: 600,
  });

  assert.deepEqual(created, {
    transferCode: "P7K2D-M9Q4R",
    expiresAt: "2026-06-01T12:10:00.000Z",
    expiresInSeconds: 600,
  });
  assert.equal(requests[0]?.url, `${DEFAULT_PERSISTLY_API_BASE_URL}/api/v1/accounts/acc_test/transfer-codes`);
  assert.equal(new Headers(requests[0]?.init?.headers).get("x-persistly-account-session"), "pst_session");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    deviceLabel: "Browser",
    ttlSeconds: 600,
  });
});

test("consumeTransferCode posts to the top-level consume route without an account session header", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return createJsonResponse(200, {
        accountId: "acc_test",
        accountSessionToken: "pst_new_session",
        account: {
          accountId: "acc_test",
          accountData: { diamonds: 25 },
          slots: [{ slotId: "autosave", slotInfo: { level: 12 }, version: 7 }],
          version: 3,
        },
        syncPolicy,
      });
    },
  });

  const consumed = await client.consumeTransferCode({
    transferCode: "P7K2D-M9Q4R",
    deviceLabel: "Laptop",
  });

  assert.equal(consumed.accountId, "acc_test");
  assert.equal(consumed.accountSessionToken, "pst_new_session");
  assert.deepEqual(consumed.account.accountData, { diamonds: 25 });
  assert.equal(requests[0]?.url, `${DEFAULT_PERSISTLY_API_BASE_URL}/api/v1/account-transfer-codes/consume`);
  assert.equal(new Headers(requests[0]?.init?.headers).get("x-persistly-account-session"), null);
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    transferCode: "P7K2D-M9Q4R",
    deviceLabel: "Laptop",
  });
});

test("account and slot error codes map to account-first error classes", async () => {
  assert.ok(new PersistlyAccountDeletedError("deleted") instanceof Error);
  assert.ok(new PersistlySlotDeletedError("deleted") instanceof Error);
  assert.ok(new PersistlySlotArchivedError("archived") instanceof Error);
});
