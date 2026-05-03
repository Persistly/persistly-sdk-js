import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_PERSISTLY_API_BASE_URL,
  MemorySaveCache,
  PersistlyClient,
  PersistlyPayloadTooLargeError,
  PersistlyServerError,
  PersistlySyncStatus,
  type SaveEnvelope,
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
  assert.match(String(requests[0]?.init?.headers && new Headers(requests[0].init.headers).get("authorization")), /^Bearer ps_test_runtime$/);
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
        save: {
          saveId: "sv_sync",
          playerRef: "player-184",
          metadata: { slot: 2 },
          state: { gold: 125 },
          version: 4,
          createdAt: "2026-04-09T10:00:00Z",
          updatedAt: "2026-04-09T10:06:00Z",
        },
      });
    },
  });

  const result = await client.syncSave("sv_sync", {
    state: { gold: 125 },
  });

  assert.equal(result.status, PersistlySyncStatus.Accepted);
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
