import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_PERSISTLY_API_BASE_URL,
  PersistlyAccountAuthConflictError,
  PersistlyApiError,
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

test("client exchanges Supabase token for account session with optional current account headers", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return jsonResponse(200, {
        accountId: "acc_auth",
        accountSessionToken: "pst_auth",
        isNewAccount: false,
        linkedProvider: "supabase",
        wasProviderNewForAccount: true,
      });
    },
  });

  const result = await client.exchangeAccountAuthSession({
    provider: "supabase",
    token: "supabase-access-token",
    deviceLabel: "Laptop",
    accountId: "acc_local",
    accountSessionToken: "pst_local",
  });

  assert.deepEqual(result, {
    accountId: "acc_auth",
    accountSessionToken: "pst_auth",
    isNewAccount: false,
    linkedProvider: "supabase",
    wasProviderNewForAccount: true,
  });
  assert.equal(requests[0]?.url, `${DEFAULT_PERSISTLY_API_BASE_URL}/api/v1/accounts/auth/session`);
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    provider: "supabase",
    token: "supabase-access-token",
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
          syncPolicy,
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

test("signInWithSupabaseToken stores returned account session", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const persistly = new PersistlyGameSavesInstance({
    runtimeKey: "ps_test_runtime",
    storage: "memory",
    accountMode: "authRequired",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return jsonResponse(200, {
        accountId: "acc_auth",
        accountSessionToken: "pst_auth",
        isNewAccount: true,
        linkedProvider: "supabase",
        wasProviderNewForAccount: true,
        syncPolicy,
      });
    },
  });

  const auth = await persistly.signInWithSupabaseToken("supabase-access-token", { deviceLabel: "Laptop" });
  const session = await persistly.getAccountSession({ includeToken: true });

  assert.equal(auth.linkedProvider, "supabase");
  assert.deepEqual(session, { accountId: "acc_auth", accountSessionToken: "pst_auth" });
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    provider: "supabase",
    token: "supabase-access-token",
    deviceLabel: "Laptop",
  });
});

test("signInWithAuth0Token stores returned account session", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const persistly = new PersistlyGameSavesInstance({
    runtimeKey: "ps_test_runtime",
    storage: "memory",
    accountMode: "authRequired",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return jsonResponse(200, {
        accountId: "acc_auth",
        accountSessionToken: "pst_auth",
        isNewAccount: true,
        linkedProvider: "auth0",
        wasProviderNewForAccount: true,
        syncPolicy,
      });
    },
  });

  const auth = await persistly.signInWithAuth0Token("auth0-token", { deviceLabel: "Laptop" });
  const session = await persistly.getAccountSession({ includeToken: true });

  assert.equal(auth.linkedProvider, "auth0");
  assert.deepEqual(session, { accountId: "acc_auth", accountSessionToken: "pst_auth" });
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    provider: "auth0",
    token: "auth0-token",
    deviceLabel: "Laptop",
  });
});


test("signInWithFirebaseToken stores returned sync policy for due sync decisions", async () => {
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
          syncPolicy: {
            ...syncPolicy,
            minRemoteSyncIntervalSeconds: 3600,
          },
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
        const body = JSON.parse(String(init?.body));
        return jsonResponse(201, {
          accountId: "acc_auth",
          account: {
            accountId: "acc_auth",
            accountData: {},
            slots: [{ slotId: body.slotId, slotInfo: body.slotInfo ?? {}, version: 1 }],
            version: 1,
          },
          slot: {
            slotId: body.slotId,
            slotInfo: body.slotInfo ?? {},
            data: body.data,
            version: 1,
            updatedAt: "2026-06-06T00:00:00.000Z",
          },
        });
      }
      throw new Error(`unexpected request ${url}`);
    },
  });

  await persistly.signInWithFirebaseToken("firebase-id-token", { deviceLabel: "Laptop" });
  await persistly.saveData({ level: 2 });
  await persistly.forceSyncData({ bypassCooldown: true });
  await persistly.saveData({ level: 3 });

  const due = await persistly.syncDueSlots({ includeSkipped: true });

  assert.deepEqual(due, [
    {
      status: PersistlyGameSaveStatus.Cooldown,
      target: "slot",
      slotId: "autosave",
      slotKey: "autosave",
    },
  ]);
  assert.equal(requests.filter((request) => request.url.endsWith("/api/v1/accounts/acc_auth/slots")).length, 1);
});

test("firebase project mismatch preserves safe SDK error code and excludes provider token", async () => {
  const safeMessage = "This Firebase token belongs to a different Firebase project than the one configured for this environment.";
  const providerToken = "firebase-secret-provider-token";
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    fetch: async () => jsonResponse(401, {
      error: {
        code: "firebase_project_mismatch",
        message: safeMessage,
        retryable: false,
      },
    }),
  });

  await assert.rejects(
    () => client.exchangeAccountAuthSession({ provider: "firebase", token: providerToken }),
    (error) => error instanceof PersistlyApiError
      && error.code === "firebase_project_mismatch"
      && error.message === safeMessage
      && !String(error).includes(providerToken)
      && !error.stack?.includes(providerToken),
  );
});

test("provider token is sent only to auth session exchange, never normal save load or sync", async () => {
  const providerToken = "supabase-secret-provider-token";
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
          linkedProvider: "supabase",
          wasProviderNewForAccount: true,
          syncPolicy,
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
        const body = JSON.parse(String(init?.body));
        return jsonResponse(201, {
          accountId: "acc_auth",
          account: {
            accountId: "acc_auth",
            accountData: {},
            slots: [{ slotId: body.slotId, slotInfo: body.slotInfo ?? {}, version: 1 }],
            version: 1,
          },
          slot: {
            slotId: body.slotId,
            slotInfo: body.slotInfo ?? {},
            data: body.data,
            version: 1,
            updatedAt: "2026-06-06T00:00:00.000Z",
          },
          syncPolicy,
        });
      }
      throw new Error(`unexpected request ${url}`);
    },
  });

  await persistly.signInWithSupabaseToken(providerToken, { deviceLabel: "Laptop" });
  await persistly.saveData({ level: 2 });
  await persistly.saveSlot("manual-1", { level: 3 });
  await persistly.loadData();
  await persistly.loadSlot("manual-1");
  await persistly.forceSyncData({ bypassCooldown: true });
  await persistly.forceSync("manual-1", { bypassCooldown: true });

  const authRequests = requests.filter((request) => request.url.endsWith("/api/v1/accounts/auth/session"));
  const normalRequests = requests.filter((request) => !request.url.endsWith("/api/v1/accounts/auth/session"));

  assert.equal(authRequests.length, 1);
  assert.equal(JSON.stringify(JSON.parse(String(authRequests[0]?.init?.body))).includes(providerToken), true);
  for (const request of normalRequests) {
    assert.equal(JSON.stringify(request.init ?? {}).includes(providerToken), false, request.url);
  }
});

test("linkProvider uses current account session headers for Supabase", async () => {
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
        linkedProvider: "supabase",
        wasProviderNewForAccount: true,
      });
    },
  });

  const result = await persistly.linkProvider({ provider: "supabase", token: "supabase-access-token" });

  assert.equal(result.accountSessionToken, "pst_rotated");
  assert.equal(result.linkedProvider, "supabase");
  const headers = new Headers(requests[0]?.init?.headers);
  assert.equal(headers.get("x-persistly-account-id"), "acc_local");
  assert.equal(headers.get("x-persistly-account-session"), "pst_local");
});

test("linkProvider conflict preserves current account session", async () => {
  const persistly = new PersistlyGameSavesInstance({
    runtimeKey: "ps_test_runtime",
    storage: "memory",
    accountId: "acc_local",
    accountSessionToken: "pst_local",
    fetch: async () => jsonResponse(409, {
      error: {
        code: "account_auth_conflict",
        message: "Auth identity is already linked to another account.",
        details: {
          summary: {
            linkedProvider: "firebase",
            linkedProviderCount: 1,
            linkedAccount: { activeSlotCount: 1 },
          },
        },
      },
    }),
  });

  await assert.rejects(
    () => persistly.linkProvider({ provider: "firebase", token: "firebase-id-token" }),
    (error) => error instanceof PersistlyAccountAuthConflictError,
  );

  assert.deepEqual(await persistly.getAccountSession({ includeToken: true }), {
    accountId: "acc_local",
    accountSessionToken: "pst_local",
  });
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
        {
          provider: "supabase",
          display: {
            label: "Supabase",
            emailHint: "pl***@example.com",
          },
          linkedAt: "2026-06-07T12:00:00Z",
        },
        {
          provider: "auth0",
          display: {
            label: "Auth0",
            emailHint: "pl***@example.com",
          },
          linkedAt: "2026-06-08T12:00:00Z",
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
    {
      provider: "supabase",
      display: {
        label: "Supabase",
        emailHint: "pl***@example.com",
      },
      linkedAt: "2026-06-07T12:00:00Z",
    },
    {
      provider: "auth0",
      display: {
        label: "Auth0",
        emailHint: "pl***@example.com",
      },
      linkedAt: "2026-06-08T12:00:00Z",
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

test("client rejects unsupported auth providers before network", async () => {
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    fetch: async () => {
      throw new Error("unsupported providers must fail before network");
    },
  });

  await assert.rejects(
    () => client.exchangeAccountAuthSession({ provider: "google", token: "google-id-token" }),
    /provider must be "firebase", "supabase", or "auth0"/,
  );
  await assert.rejects(
    () => client.exchangeAccountAuthSession({ provider: "oidc_jwt", token: "provider-jwt" }),
    /provider must be "firebase", "supabase", or "auth0"/,
  );
});

test("supabase token errors preserve safe SDK error code and exclude provider token", async () => {
  const safeMessage = "Supabase access token is invalid.";
  const providerToken = "supabase-secret-provider-token";
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    fetch: async () => jsonResponse(401, {
      error: {
        code: "supabase_token_invalid",
        message: safeMessage,
        retryable: false,
      },
    }),
  });

  await assert.rejects(
    () => client.exchangeAccountAuthSession({ provider: "supabase", token: providerToken }),
    (error) => error instanceof PersistlyApiError
      && error.code === "supabase_token_invalid"
      && error.message === safeMessage
      && !String(error).includes(providerToken)
      && !error.stack?.includes(providerToken),
  );
});

test("auth0 token errors preserve safe SDK error code and exclude provider token", async () => {
  const safeMessage = "Auth0 token is invalid.";
  const providerToken = "auth0-secret-provider-token";
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    fetch: async () => jsonResponse(401, {
      error: {
        code: "auth0_token_invalid",
        message: safeMessage,
        retryable: false,
      },
    }),
  });

  await assert.rejects(
    () => client.exchangeAccountAuthSession({ provider: "auth0", token: providerToken }),
    (error) => error instanceof PersistlyApiError
      && error.code === "auth0_token_invalid"
      && error.message === safeMessage
      && !String(error).includes(providerToken)
      && !error.stack?.includes(providerToken),
  );
});
