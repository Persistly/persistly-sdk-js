import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_PERSISTLY_API_BASE_URL,
  PersistlyAccountAuthConflictError,
  PersistlyClient,
  PersistlyGameSaveStatus,
  PersistlyGameSavesInstance,
} from "../src/index.js";

const syncPolicy = {
  minRemoteSyncIntervalSeconds: 60,
  forceSyncCooldownSeconds: 10,
  syncOnAppBackground: true,
  syncOnAppForeground: true,
  syncOnReconnect: true,
  maxQueuedLocalSnapshots: 10,
};

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("accountMode defaults to anonymousFirst", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const persistly = new PersistlyGameSavesInstance({
    runtimeKey: "ps_test_runtime",
    storage: "memory",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return jsonResponse(201, {
        accountId: "acc_created",
        accountSessionToken: "pst_session",
        account: {
          accountId: "acc_created",
          accountData: {},
          slots: [{ slotId: "autosave", slotInfo: {}, version: 1 }],
          version: 1,
        },
        slot: {
          slotId: "autosave",
          slotInfo: {},
          data: { level: 1 },
          version: 1,
          updatedAt: "2026-06-06T00:00:00.000Z",
        },
        syncPolicy,
      });
    },
  });

  await persistly.saveData({ level: 1 });
  const synced = await persistly.forceSyncData({ bypassCooldown: true });

  assert.equal(synced.status, PersistlyGameSaveStatus.Synced);
  assert.equal(requests[0]?.url, `${DEFAULT_PERSISTLY_API_BASE_URL}/api/v1/accounts`);
});

test("authRequired keeps saves local and refuses cloud sync before sign-in", async () => {
  const persistly = new PersistlyGameSavesInstance({
    runtimeKey: "ps_test_runtime",
    storage: "memory",
    accountMode: "authRequired",
    fetch: async () => {
      throw new Error("authRequired should not create an anonymous cloud account");
    },
  });

  const saved = await persistly.saveData({ level: 1 });
  const synced = await persistly.forceSyncData({ bypassCooldown: true });

  assert.equal(saved.status, PersistlyGameSaveStatus.LocalSaved);
  assert.equal(synced.status, PersistlyGameSaveStatus.AuthRequired);
});

test("client exchanges Firebase token for account session with optional current account headers", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return jsonResponse(200, {
        accountId: "acc_auth",
        accountSessionToken: "pst_auth",
        isNewAccount: false,
        linkedProvider: "firebase",
        wasProviderNewForAccount: true,
      });
    },
  });

  const result = await client.exchangeAccountAuthSession({
    provider: "firebase",
    token: "firebase-id-token",
    deviceLabel: "Laptop",
    accountId: "acc_local",
    accountSessionToken: "pst_local",
  });

  assert.deepEqual(result, {
    accountId: "acc_auth",
    accountSessionToken: "pst_auth",
    isNewAccount: false,
    linkedProvider: "firebase",
    wasProviderNewForAccount: true,
  });
  assert.equal(requests[0]?.url, `${DEFAULT_PERSISTLY_API_BASE_URL}/api/v1/accounts/auth/session`);
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    provider: "firebase",
    token: "firebase-id-token",
    deviceLabel: "Laptop",
  });
  const headers = new Headers(requests[0]?.init?.headers);
  assert.equal(headers.get("x-persistly-account-id"), "acc_local");
  assert.equal(headers.get("x-persistly-account-session"), "pst_local");
});

test("signInWithFirebaseToken stores returned account session and save after sign-in uses it", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const persistly = new PersistlyGameSavesInstance({
    runtimeKey: "ps_test_runtime",
    storage: "memory",
    accountMode: "authRequired",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      const url = String(input);
      if (url.endsWith("/api/v1/accounts/auth/session")) {
        return jsonResponse(200, {
          accountId: "acc_auth",
          accountSessionToken: "pst_auth",
          isNewAccount: true,
          linkedProvider: "firebase",
          wasProviderNewForAccount: true,
        });
      }
      if (url.endsWith("/api/v1/accounts/acc_auth")) {
        return jsonResponse(200, {
          accountId: "acc_auth",
          account: {
            accountId: "acc_auth",
            accountData: {},
            slots: [],
            version: 1,
          },
          syncPolicy,
        });
      }
      if (url.endsWith("/api/v1/accounts/acc_auth/slots")) {
        return jsonResponse(201, {
          accountId: "acc_auth",
          account: {
            accountId: "acc_auth",
            accountData: {},
            slots: [{ slotId: "autosave", slotInfo: {}, version: 1 }],
            version: 1,
          },
          slot: {
            slotId: "autosave",
            slotInfo: {},
            data: { level: 2 },
            version: 1,
            updatedAt: "2026-06-06T00:00:00.000Z",
          },
        });
      }
      throw new Error(`unexpected request ${url}`);
    },
  });

  await persistly.saveData({ level: 2 });
  const auth = await persistly.signInWithFirebaseToken("firebase-id-token", { deviceLabel: "Laptop" });
  const session = await persistly.getAccountSession({ includeToken: true });
  const synced = await persistly.forceSyncData({ bypassCooldown: true });

  assert.equal(auth.accountId, "acc_auth");
  assert.deepEqual(session, { accountId: "acc_auth", accountSessionToken: "pst_auth" });
  assert.equal(synced.status, PersistlyGameSaveStatus.Synced);
  const slotRequest = requests.find((request) => request.url.endsWith("/api/v1/accounts/acc_auth/slots"));
  assert.equal(new Headers(slotRequest?.init?.headers).get("x-persistly-account-session"), "pst_auth");
});

test("linkProvider uses current account session headers for Firebase", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const persistly = new PersistlyGameSavesInstance({
    runtimeKey: "ps_test_runtime",
    storage: "memory",
    accountId: "acc_local",
    accountSessionToken: "pst_local",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return jsonResponse(200, {
        accountId: "acc_local",
        accountSessionToken: "pst_rotated",
        isNewAccount: false,
        linkedProvider: "firebase",
        wasProviderNewForAccount: true,
      });
    },
  });

  const result = await persistly.linkProvider({ provider: "firebase", token: "firebase-id-token" });

  assert.equal(result.accountSessionToken, "pst_rotated");
  const headers = new Headers(requests[0]?.init?.headers);
  assert.equal(headers.get("x-persistly-account-id"), "acc_local");
  assert.equal(headers.get("x-persistly-account-session"), "pst_local");
});

test("listLinkedProviders parses safe provider list", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const persistly = new PersistlyGameSavesInstance({
    runtimeKey: "ps_test_runtime",
    storage: "memory",
    accountId: "acc_local",
    accountSessionToken: "pst_local",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return jsonResponse(200, [
        {
          provider: "firebase",
          display: {
            label: "Firebase",
            emailHint: "pl***@example.com",
          },
          linkedAt: "2026-06-06T12:00:00Z",
          lastUsedAt: "2026-06-06T12:30:00Z",
        },
      ]);
    },
  });

  const providers = await persistly.listLinkedProviders();

  assert.deepEqual(providers, [
    {
      provider: "firebase",
      display: {
        label: "Firebase",
        emailHint: "pl***@example.com",
      },
      linkedAt: "2026-06-06T12:00:00Z",
      lastUsedAt: "2026-06-06T12:30:00Z",
    },
  ]);
  assert.equal(requests[0]?.url, `${DEFAULT_PERSISTLY_API_BASE_URL}/api/v1/accounts/auth/providers`);
  const headers = new Headers(requests[0]?.init?.headers);
  assert.equal(headers.get("x-persistly-account-id"), "acc_local");
  assert.equal(headers.get("x-persistly-account-session"), "pst_local");
});

test("signOut clears local account and slots", async () => {
  const persistly = new PersistlyGameSavesInstance({
    runtimeKey: "ps_test_runtime",
    storage: "memory",
    accountMode: "authRequired",
    fetch: async () => {
      throw new Error("signOut should only clear local state");
    },
  });

  await persistly.saveData({ level: 4 });
  const result = await persistly.signOut();
  const loaded = await persistly.loadData();
  const session = await persistly.getAccountSession({ includeToken: true });

  assert.equal(result.status, PersistlyGameSaveStatus.LocalSaved);
  assert.equal(loaded.status, PersistlyGameSaveStatus.NotFound);
  assert.deepEqual(session, {});
});

test("account_auth_conflict becomes a typed SDK error", async () => {
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    fetch: async () => jsonResponse(409, {
      error: {
        code: "account_auth_conflict",
        message: "Auth identity is already linked to another account.",
        details: {
          summary: {
            linkedProvider: "firebase",
            linkedProviderCount: 1,
            linkedAccount: { activeSlotCount: 2 },
          },
        },
      },
    }),
  });

  await assert.rejects(
    () => client.exchangeAccountAuthSession({ provider: "firebase", token: "firebase-id-token" }),
    (error) => error instanceof PersistlyAccountAuthConflictError
      && error.code === "account_auth_conflict"
      && error.status === 409,
  );
});

test("client rejects non-Firebase auth providers in Phase 1A", async () => {
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    fetch: async () => {
      throw new Error("unsupported providers must fail before network");
    },
  });

  await assert.rejects(
    () => client.exchangeAccountAuthSession({ provider: "google", token: "google-id-token" }),
    /provider must be "firebase"/,
  );
  await assert.rejects(
    () => client.exchangeAccountAuthSession({ provider: "oidc_jwt", token: "provider-jwt" }),
    /provider must be "firebase"/,
  );
});
