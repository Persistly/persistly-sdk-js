import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_PERSISTLY_API_BASE_URL,
  MemorySaveCache,
  PersistlyClient,
  PersistlyConfigurationError,
  PersistlyForbiddenError,
  PersistlyCharacterArchivedError,
  PersistlyPayloadTooLargeError,
  PersistlySlotAlreadyExistsError,
  PersistlyServerError,
  PersistlySyncStatus,
  type SaveEnvelope,
  type ProfileEnvelope,
  type SyncConflictResult,
} from "../src/index.js";

function createJsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("createSave posts the contract payload and caches the canonical save", async () => {
  const cache = new MemorySaveCache();
  const expected: SaveEnvelope = {
    save: {
      saveId: "sv_create",
      playerRef: "player-184",
      metadata: { slot: 2 },
      state: { level: 1 },
      version: 1,
      createdAt: "2026-04-09T10:00:00Z",
      updatedAt: "2026-04-09T10:00:00Z",
    },
  };

  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    cache,
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return createJsonResponse(201, expected);
    },
  });

  const created = await client.createSave({
    playerRef: "player-184",
    metadata: { slot: 2 },
    state: { level: 1 },
  });

  assert.equal(created.saveId, expected.save.saveId);
  assert.deepEqual(await cache.get(expected.save.saveId), expected.save);
  assert.equal(requests[0]?.url, `${DEFAULT_PERSISTLY_API_BASE_URL}/api/v1/saves`);
  assert.equal(requests[0]?.init?.method, "POST");
  const headers = new Headers(requests[0]?.init?.headers);
  assert.match(String(headers.get("authorization")), /^Bearer ps_test_runtime$/);
  assert.equal(headers.get("x-persistly-sdk"), "javascript");
  assert.equal(headers.get("x-persistly-sdk-version"), "0.10.0");
  assert.ok(headers.get("x-persistly-platform"));
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    playerRef: "player-184",
    metadata: { slot: 2 },
    state: { level: 1 },
  });
});

test("createSave defaults to the public Persistly API origin when no base URL is configured", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return createJsonResponse(201, {
        save: {
          saveId: "sv_default_origin",
          playerRef: null,
          metadata: {},
          state: { level: 1 },
          version: 1,
          createdAt: "2026-04-09T10:00:00Z",
          updatedAt: "2026-04-09T10:00:00Z",
        },
      });
    },
  });

  await client.createSave({
    state: { level: 1 },
  });

  assert.equal(requests[0]?.url, `${DEFAULT_PERSISTLY_API_BASE_URL}/api/v1/saves`);
});

test("createSave ignores legacy baseUrl overrides and still uses the public Persistly API origin", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return createJsonResponse(201, {
        save: {
          saveId: "sv_ignore_override",
          playerRef: null,
          metadata: {},
          state: { level: 1 },
          version: 1,
          createdAt: "2026-04-09T10:00:00Z",
          updatedAt: "2026-04-09T10:00:00Z",
        },
      });
    },
    // Simulate stale consumer code still trying to pass a removed config field.
    // @ts-expect-error legacy compatibility path should be ignored at runtime.
    baseUrl: "https://persistly.example",
  });

  await client.createSave({
    state: { level: 1 },
  });

  assert.equal(requests[0]?.url, `${DEFAULT_PERSISTLY_API_BASE_URL}/api/v1/saves`);
});

test("loadSave caches the canonical save from the runtime API", async () => {
  const cache = new MemorySaveCache();
  const expected: SaveEnvelope = {
    save: {
      saveId: "sv_load",
      playerRef: null,
      metadata: {},
      state: { level: 5 },
      version: 7,
      createdAt: "2026-04-09T10:00:00Z",
      updatedAt: "2026-04-09T10:09:00Z",
    },
  };

  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    cache,
    fetch: async () => createJsonResponse(200, expected),
  });

  const loaded = await client.loadSave("sv_load");

  assert.equal(loaded.version, 7);
  assert.deepEqual(await cache.get("sv_load"), expected.save);
});

test("loadSave rejects an empty saveId before making a runtime request", async () => {
  let fetchCalls = 0;
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    fetch: async () => {
      fetchCalls += 1;
      return createJsonResponse(200, {});
    },
  });

  await assert.rejects(
    () => client.loadSave(""),
    /requires a non-empty saveId/i,
  );
  assert.equal(fetchCalls, 0);
});

test("syncSave uses the cached version and stores accepted saves", async () => {
  const cache = new MemorySaveCache();
  await cache.set({
    saveId: "sv_sync",
    playerRef: "player-184",
    metadata: { slot: 2 },
    state: { gold: 100 },
    version: 3,
    createdAt: "2026-04-09T10:00:00Z",
    updatedAt: "2026-04-09T10:05:00Z",
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
        updatedAt: "2026-04-09T10:06:00Z",
        historyRetained: true,
      });
    },
  });

  const result = await client.syncSave("sv_sync", {
    state: { gold: 125 },
  });

  assert.equal(result.status, PersistlySyncStatus.Accepted);
  assert.equal(result.version, 4);
  assert.equal(result.updatedAt, "2026-04-09T10:06:00Z");
  assert.equal(result.historyRetained, true);
  assert.deepEqual(result.save.state, { gold: 125 });
  assert.deepEqual(await cache.get("sv_sync"), result.save);
  assert.equal(requests[0]?.url, `${DEFAULT_PERSISTLY_API_BASE_URL}/api/v1/saves/sv_sync/sync`);
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    baseVersion: 3,
    state: { gold: 125 },
  });
});

test("syncSave stores canonical server state on conflict", async () => {
  const cache = new MemorySaveCache();
  await cache.set({
    saveId: "sv_sync_conflict",
    playerRef: "player-184",
    metadata: { slot: 2 },
    state: { gold: 100 },
    version: 3,
    createdAt: "2026-04-09T10:00:00Z",
    updatedAt: "2026-04-09T10:05:00Z",
  });

  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    cache,
    fetch: async () =>
      createJsonResponse(409, {
        status: "conflict",
        save: {
          saveId: "sv_sync_conflict",
          playerRef: "player-184",
          metadata: { slot: 2 },
          state: { gold: 140 },
          version: 5,
          createdAt: "2026-04-09T10:00:00Z",
          updatedAt: "2026-04-09T10:06:00Z",
        },
        details: {
          reason: "base_version_mismatch",
        },
      }),
  });

  const conflict = (await client.syncSave("sv_sync_conflict", {
    state: { gold: 999 },
  })) as SyncConflictResult;

  assert.equal(conflict.status, PersistlySyncStatus.Conflict);
  assert.deepEqual(await cache.get("sv_sync_conflict"), conflict.save);
  assert.equal(conflict.save.version, 5);
});

test("syncSave rejects an empty saveId before making a runtime request", async () => {
  let fetchCalls = 0;
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    fetch: async () => {
      fetchCalls += 1;
      return createJsonResponse(200, {});
    },
  });

  await assert.rejects(
    () => client.syncSave("", {
      baseVersion: 1,
      state: { gold: 125 },
    }),
    /requires a non-empty saveId/i,
  );
  assert.equal(fetchCalls, 0);
});

test("updateLocal writes a canonical save to the configured cache without calling fetch", async () => {
  const cache = new MemorySaveCache();
  let fetchCalls = 0;
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    cache,
    fetch: async () => {
      fetchCalls += 1;
      return createJsonResponse(500, {
        error: {
          code: "server_error",
          message: "unexpected",
        },
      });
    },
  });

  await client.updateLocal({
    saveId: "sv_local",
    playerRef: "player-184",
    metadata: { slot: 4 },
    state: { level: 9 },
    version: 11,
    createdAt: "2026-04-09T10:00:00Z",
    updatedAt: "2026-04-09T10:10:00Z",
  });

  assert.equal(fetchCalls, 0);
  assert.deepEqual(await cache.get("sv_local"), {
    saveId: "sv_local",
    playerRef: "player-184",
    metadata: { slot: 4 },
    state: { level: 9 },
    version: 11,
    createdAt: "2026-04-09T10:00:00Z",
    updatedAt: "2026-04-09T10:10:00Z",
  });
});

test("getLocal reads from the configured cache without calling fetch", async () => {
  const cache = new MemorySaveCache();
  await cache.set({
    saveId: "sv_local_read",
    playerRef: null,
    metadata: { slot: 1 },
    state: { level: 2 },
    version: 3,
    createdAt: "2026-04-09T10:00:00Z",
    updatedAt: "2026-04-09T10:03:00Z",
  });

  let fetchCalls = 0;
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    cache,
    fetch: async () => {
      fetchCalls += 1;
      return createJsonResponse(500, {
        error: {
          code: "server_error",
          message: "unexpected",
        },
      });
    },
  });

  const local = await client.getLocal("sv_local_read");

  assert.equal(fetchCalls, 0);
  assert.deepEqual(local, {
    saveId: "sv_local_read",
    playerRef: null,
    metadata: { slot: 1 },
    state: { level: 2 },
    version: 3,
    createdAt: "2026-04-09T10:00:00Z",
    updatedAt: "2026-04-09T10:03:00Z",
  });
});

test("loadSave converts empty upstream error bodies into a server error instead of a JSON parse failure", async () => {
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    fetch: async () =>
      new Response("", {
        status: 502,
        headers: { "content-type": "application/json" },
      }),
  });

  await assert.rejects(
    () => client.loadSave("sv_missing_body"),
    (error: unknown) =>
      error instanceof PersistlyServerError &&
      error.message === "Persistly returned an empty error response with status 502.",
  );
});

test("loadSave converts malformed upstream error bodies into a server error instead of a JSON parse failure", async () => {
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    fetch: async () =>
      new Response("<html>proxy down</html>", {
        status: 502,
        headers: { "content-type": "text/html" },
      }),
  });

  await assert.rejects(
    () => client.loadSave("sv_bad_error_body"),
    (error: unknown) =>
      error instanceof PersistlyServerError &&
      error.message === "Persistly returned a non-JSON error response with status 502.",
  );
});

test("createSave enforces pinned payload limits before any runtime call", async () => {
  let fetchCalls = 0;
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    fetch: async () => {
      fetchCalls += 1;
      return createJsonResponse(500, {
        error: {
          code: "server_error",
          message: "unexpected",
        },
      });
    },
  });

  await assert.rejects(
    () =>
      client.createSave({
        metadata: {},
        state: {
          blob: "x".repeat(262144),
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof PersistlyPayloadTooLargeError);
      assert.equal(error.code, "payload_too_large");
      assert.deepEqual(error.details, { field: "state", maxBytes: 262144 });
      assert.equal(fetchCalls, 0);
      return true;
    },
  );
});

test("updateLocal rejects saves with non-contract version or timestamp fields", async () => {
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
  });

  await assert.rejects(
    () =>
      client.updateLocal({
        saveId: "sv_invalid",
        playerRef: null,
        metadata: {},
        state: {},
        version: 1.5,
        createdAt: "not-a-date",
        updatedAt: "2026-04-09T10:03:00Z",
      }),
    /version must be an integer greater than or equal to 1|must be a valid RFC 3339 date-time string/i,
  );
});

test("API errors preserve the contract code, message, and details", async () => {
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    fetch: async () =>
      createJsonResponse(413, {
        error: {
          code: "payload_too_large",
          message: "State exceeds the maximum allowed size.",
          details: {
            field: "state",
            maxBytes: 262144,
          },
        },
      }),
  });

  await assert.rejects(
    () =>
      client.createSave({
        state: { huge: true },
      }),
    (error: unknown) => {
      assert.ok(error instanceof PersistlyPayloadTooLargeError);
      assert.equal(error.code, "payload_too_large");
      assert.equal(error.message, "State exceeds the maximum allowed size.");
      assert.deepEqual(error.details, { field: "state", maxBytes: 262144 });
      return true;
    },
  );
});

test("client does not expose any player ref lookup helpers", () => {
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
  });

  assert.equal(typeof (client as Record<string, unknown>).loadSaveByPlayerRef, "undefined");
  assert.equal(typeof (client as Record<string, unknown>).findSaveByPlayerRef, "undefined");
  assert.equal(typeof (client as Record<string, unknown>).listSaves, "undefined");
});

test("createProfile posts profile payload, session-caches saves, and returns session token", async () => {
  const cache = new MemorySaveCache();
  const expected: ProfileEnvelope = {
    profileSaveId: "sv_profile",
    profileSessionToken: "pst_session",
    syncPolicy: {
      minRemoteSyncIntervalSeconds: 60,
      forceSyncCooldownSeconds: 10,
      syncOnAppBackground: true,
      syncOnAppForeground: true,
      syncOnReconnect: true,
      maxQueuedLocalSnapshots: 25,
    },
    profile: {
      saveId: "sv_profile",
      playerRef: "player-184",
      metadata: { profileLabel: "Main" },
      state: {
        schema: "persistly.profile.v1",
        accountData: { diamonds: 1200 },
        characterSlots: [
          {
            slotKey: "autosave",
            characterSaveId: "sv_character",
            metadata: {
              _persistly: { slotKey: "autosave" },
              characterName: "Ayla",
            },
          },
        ],
      },
      version: 1,
      createdAt: "2026-04-09T10:00:00Z",
      updatedAt: "2026-04-09T10:00:00Z",
    },
    character: {
      saveId: "sv_character",
      playerRef: "player-184",
      metadata: { _persistly: { slotKey: "autosave" }, characterName: "Ayla" },
      state: { level: 1 },
      version: 1,
      createdAt: "2026-04-09T10:00:00Z",
      updatedAt: "2026-04-09T10:00:00Z",
    },
  };
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    cache,
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return createJsonResponse(201, expected);
    },
  });

  const result = await client.createProfile({
    playerRef: "player-184",
    externalProfileRef: { provider: "auth0", subject: "auth0|abc123" },
    profileMetadata: { profileLabel: "Main" },
    accountData: { diamonds: 1200 },
    character: {
      metadata: { _persistly: { slotKey: "autosave" }, characterName: "Ayla" },
      state: { level: 1 },
    },
  });

  assert.equal(result.profileSessionToken, "pst_session");
  assert.equal(result.profileSaveId, "sv_profile");
  assert.deepEqual(await cache.get("sv_profile"), expected.profile);
  assert.deepEqual(await cache.get("sv_character"), expected.character);
  assert.equal(requests[0]?.url, `${DEFAULT_PERSISTLY_API_BASE_URL}/api/v1/profiles`);
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    playerRef: "player-184",
    externalProfileRef: { provider: "auth0", subject: "auth0|abc123" },
    profileMetadata: { profileLabel: "Main" },
    accountData: { diamonds: 1200 },
    character: {
      metadata: { _persistly: { slotKey: "autosave" }, characterName: "Ayla" },
      state: { level: 1 },
    },
  });
});

test("createProfile supports profile-only creation without first character", async () => {
  const cache = new MemorySaveCache();
  const expected: ProfileEnvelope = {
    profileSaveId: "sv_profile_only",
    profileSessionToken: "pst_session",
    syncPolicy: {
      minRemoteSyncIntervalSeconds: 60,
      forceSyncCooldownSeconds: 10,
      syncOnAppBackground: true,
      syncOnAppForeground: true,
      syncOnReconnect: true,
      maxQueuedLocalSnapshots: 25,
    },
    profile: {
      saveId: "sv_profile_only",
      playerRef: "player-184",
      metadata: {},
      state: {
        schema: "persistly.profile.v1",
        accountData: {},
        characterSlots: [],
      },
      version: 1,
      createdAt: "2026-04-09T10:00:00Z",
      updatedAt: "2026-04-09T10:00:00Z",
    },
  };
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    cache,
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return createJsonResponse(201, expected);
    },
  });

  const result = await client.createProfile({
    playerRef: "player-184",
    accountData: {},
  });

  assert.equal(result.profileSaveId, "sv_profile_only");
  assert.equal(result.character, undefined);
  assert.deepEqual(await cache.get("sv_profile_only"), expected.profile);
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    playerRef: "player-184",
    accountData: {},
  });
});

test("syncProfileAccountData posts the account-data route and preserves profile result", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return createJsonResponse(200, {
        status: "accepted",
        version: 4,
        updatedAt: "2026-04-09T10:05:00Z",
        historyRetained: false,
      });
    },
  });

  const result = await client.syncProfileAccountData({
    profileSaveId: "sv_profile",
    profileSessionToken: "pst_session",
    baseVersion: 3,
    accountDataPatch: { diamonds: 1500 },
    metadata: null,
  });

  assert.equal(result.status, PersistlySyncStatus.Accepted);
  assert.equal(result.save.version, 4);
  assert.deepEqual(result.save.state, {
    schema: "persistly.profile.v1",
    accountData: { diamonds: 1500 },
    characterSlots: [],
  });
  assert.equal(requests[0]?.url, `${DEFAULT_PERSISTLY_API_BASE_URL}/api/v1/profiles/sv_profile/account-data/sync`);
  assert.equal(new Headers(requests[0]?.init?.headers).get("x-persistly-profile-session"), "pst_session");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    baseVersion: 3,
    accountDataPatch: { diamonds: 1500 },
    metadata: null,
  });
});

test("syncProfileAccountData rejects accountData with patch and empty sync body", async () => {
  let fetchCalls = 0;
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    fetch: async () => {
      fetchCalls += 1;
      return createJsonResponse(500, {});
    },
  });

  await assert.rejects(
    () =>
      client.syncProfileAccountData({
        profileSaveId: "sv_profile",
        profileSessionToken: "pst_session",
        baseVersion: 3,
        accountData: { diamonds: 1500 },
        accountDataPatch: { coins: 20 },
      }),
    PersistlyConfigurationError,
  );

  await assert.rejects(
    () =>
      client.syncProfileAccountData({
        profileSaveId: "sv_profile",
        profileSessionToken: "pst_session",
        baseVersion: 3,
      }),
    PersistlyConfigurationError,
  );

  assert.equal(fetchCalls, 0);
});

test("profile character inputs reject reserved persistly metadata beyond slotKey", async () => {
  let fetchCalls = 0;
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    fetch: async () => {
      fetchCalls += 1;
      return createJsonResponse(500, {});
    },
  });

  await assert.rejects(
    () =>
      client.createProfile({
        character: {
          metadata: { _persistly: { slotKey: "autosave", owner: "game" } },
          state: { level: 1 },
        },
      }),
    PersistlyConfigurationError,
  );

  await assert.rejects(
    () =>
      client.createProfileCharacter({
        profileSaveId: "sv_profile",
        profileSessionToken: "pst_session",
        metadata: { _persistly: { slotKey: "autosave", owner: "game" } },
        state: { level: 1 },
      }),
    PersistlyConfigurationError,
  );

  await assert.rejects(
    () =>
      client.syncProfileCharacter({
        profileSaveId: "sv_profile",
        profileSessionToken: "pst_session",
        characterSaveId: "sv_character",
        baseVersion: 1,
        metadata: { _persistly: { slotKey: "autosave", owner: "game" } },
        state: { level: 2 },
      }),
    PersistlyConfigurationError,
  );

  assert.equal(fetchCalls, 0);
});

test("archiveProfileCharacter posts archive route and caches returned profile", async () => {
  const cache = new MemorySaveCache();
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    cache,
    fetch: async () =>
      createJsonResponse(200, {
        profileSaveId: "sv_profile",
        profile: {
          saveId: "sv_profile",
          playerRef: "player-184",
          metadata: {},
          state: {
            schema: "persistly.profile.v1",
            accountData: {},
            characterSlots: [
              {
                slotKey: "autosave",
                characterSaveId: "sv_character",
                metadata: { _persistly: { slotKey: "autosave" } },
                archived: true,
                archivedAt: "2026-04-09T10:10:00Z",
              },
            ],
          },
          version: 3,
          createdAt: "2026-04-09T10:00:00Z",
          updatedAt: "2026-04-09T10:10:00Z",
        },
      }),
  });

  const envelope = await client.archiveProfileCharacter({
    profileSaveId: "sv_profile",
    profileSessionToken: "pst_session",
    characterSaveId: "sv_character",
  });

  assert.equal(envelope.profile.state.characterSlots[0]?.archived, true);
  assert.deepEqual(await cache.get("sv_profile"), envelope.profile);
});

test("duplicate slot and archived character errors are typed", async () => {
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    fetch: async (input) => {
      if (String(input).endsWith("/characters/sv_character/sync")) {
        return createJsonResponse(409, {
          error: {
            code: "character_archived",
            message: "Archived characters cannot be synced.",
            details: { characterSaveId: "sv_character" },
          },
        });
      }

      return createJsonResponse(409, {
        error: {
          code: "slot_already_exists",
          message: "An active character already exists for this slot key.",
          details: { slotKey: "autosave" },
        },
      });
    },
  });

  await assert.rejects(
    () =>
      client.createProfileCharacter({
        profileSaveId: "sv_profile",
        profileSessionToken: "pst_session",
        metadata: { _persistly: { slotKey: "autosave" } },
        state: { level: 1 },
      }),
    (error: unknown) => error instanceof PersistlySlotAlreadyExistsError && error.code === "slot_already_exists",
  );

  await assert.rejects(
    () =>
      client.syncProfileCharacter({
        profileSaveId: "sv_profile",
        profileSessionToken: "pst_session",
        characterSaveId: "sv_character",
        baseVersion: 1,
        state: { level: 2 },
      }),
    (error: unknown) => error instanceof PersistlyCharacterArchivedError && error.code === "character_archived",
  );
});

test("profile session is sent when loading and syncing profile characters", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });

      if (String(input).endsWith("/characters/sv_character/sync")) {
        return createJsonResponse(200, {
          status: "accepted",
          save: {
            saveId: "sv_character",
            playerRef: "player-184",
            metadata: { characterName: "Ayla" },
            state: { level: 2 },
            version: 2,
            createdAt: "2026-04-09T10:00:00Z",
            updatedAt: "2026-04-09T10:01:00Z",
          },
        });
      }

      return createJsonResponse(200, {
        save: {
          saveId: "sv_character",
          playerRef: "player-184",
          metadata: { characterName: "Ayla" },
          state: { level: 1 },
          version: 1,
          createdAt: "2026-04-09T10:00:00Z",
          updatedAt: "2026-04-09T10:00:00Z",
        },
      });
    },
  });

  await client.loadProfileCharacter({
    profileSaveId: "sv_profile",
    characterSaveId: "sv_character",
    profileSessionToken: "pst_session",
  });
  const result = await client.syncProfileCharacter({
    profileSaveId: "sv_profile",
    characterSaveId: "sv_character",
    profileSessionToken: "pst_session",
    baseVersion: 1,
    state: { level: 2 },
  });

  assert.equal(result.status, PersistlySyncStatus.Accepted);
  assert.equal(new Headers(requests[0]?.init?.headers).get("x-persistly-profile-session"), "pst_session");
  assert.equal(new Headers(requests[1]?.init?.headers).get("x-persistly-profile-session"), "pst_session");
  assert.equal(requests[0]?.url, `${DEFAULT_PERSISTLY_API_BASE_URL}/api/v1/profiles/sv_profile/characters/sv_character`);
  assert.equal(requests[1]?.url, `${DEFAULT_PERSISTLY_API_BASE_URL}/api/v1/profiles/sv_profile/characters/sv_character/sync`);
});

test("profile session forbidden responses surface as typed forbidden errors", async () => {
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    fetch: async () =>
      createJsonResponse(403, {
        error: {
          code: "forbidden",
          message: "Profile session cannot access this character.",
        },
      }),
  });

  await assert.rejects(
    () =>
      client.loadProfileCharacter({
        profileSaveId: "sv_profile",
        profileSessionToken: "pst_session",
        characterSaveId: "sv_character",
      }),
    (error) => {
      assert.ok(error instanceof PersistlyForbiddenError);
      assert.equal(error.status, 403);
      assert.equal(error.code, "forbidden");
      return true;
    },
  );
});

test("getRuntimeConfig returns the sync policy", async () => {
  const requests: string[] = [];
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    fetch: async (input) => {
      requests.push(String(input));
      return (
      createJsonResponse(200, {
        syncPolicy: {
          minRemoteSyncIntervalSeconds: 40,
          forceSyncCooldownSeconds: 10,
          syncOnAppBackground: true,
          syncOnAppForeground: true,
          syncOnReconnect: true,
          maxQueuedLocalSnapshots: 25,
        },
        gameConfig: {
          enabled: true,
          version: 3,
          sizeBytes: 37,
          hasData: true,
          eventName: "launch",
          config: { season: "spring" },
        },
      })
      );
    },
  });

  const config = await client.getRuntimeConfig({ gameConfigVersion: 2 });

  assert.equal(requests[0], `${DEFAULT_PERSISTLY_API_BASE_URL}/api/v1/runtime-config?gameConfigVersion=2`);
  assert.equal(config.syncPolicy.minRemoteSyncIntervalSeconds, 40);
  assert.equal(config.syncPolicy.forceSyncCooldownSeconds, 10);
  assert.equal(config.gameConfig?.enabled, true);
  assert.equal(config.gameConfig?.version, 3);
  assert.deepEqual(config.gameConfig?.config, { season: "spring" });
});
