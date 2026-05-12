import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PERSISTLY_API_BASE_URL,
  PersistlyGameSaveStatus,
  PersistlyGameSaveTarget,
  PersistlyGameSaves,
  PersistlyGameSavesInstance,
  PersistlyStorageError,
  PersistlySyncStatus,
  type PersistlyGameSaveSyncResult,
} from "../src/index.ts";

class FakeStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

async function withFakeLocalStorage<T>(storage: FakeStorage, run: () => Promise<T>): Promise<T> {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });

  try {
    return await run();
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, "localStorage", descriptor);
    } else {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  }
}

function createJsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createSave(saveId: string, state: Record<string, unknown>, version = 1, metadata: Record<string, unknown> = {}) {
  return {
    saveId,
    playerRef: "player-184",
    metadata,
    state,
    version,
    createdAt: "2026-04-09T10:00:00Z",
    updatedAt: "2026-04-09T10:00:00Z",
  };
}

function createProfileEnvelope(character?: ReturnType<typeof createSave>) {
  return {
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
    profile: createSave("sv_profile", {
      schema: "persistly.profile.v1",
      accountData: { diamonds: 1200 },
      characterSlots: character
        ? [
            {
              slotKey: "autosave",
              characterSaveId: character.saveId,
              metadata: character.metadata,
            },
          ]
        : [],
    }),
    ...(character ? { character } : {}),
  };
}

test("exports high-level status and target constants", () => {
  assert.equal(PersistlyGameSaveStatus.LocalSaved, "local_saved");
  assert.equal(PersistlyGameSaveStatus.LocalFound, "local_found");
  assert.equal(PersistlyGameSaveStatus.NotFound, "not_found");
  assert.equal(PersistlyGameSaveStatus.NoChanges, "no_changes");
  assert.equal(PersistlyGameSaveStatus.Cooldown, "cooldown");
  assert.equal(PersistlyGameSaveStatus.Synced, "synced");
  assert.equal(PersistlyGameSaveStatus.Conflict, "conflict");
  assert.equal(PersistlyGameSaveStatus.Offline, "offline");
  assert.equal(PersistlyGameSaveStatus.RateLimited, "rate_limited");
  assert.equal(PersistlyGameSaveTarget.Profile, "profile");
  assert.equal(PersistlyGameSaveTarget.Slot, "slot");
});

test("shared facade fails clearly before configure", async () => {
  await assert.rejects(
    () => PersistlyGameSaves.shared.loadSlot("autosave"),
    /not_configured/,
  );
});

test("start is local-only and localStorage namespace prefers external profile ref", async () => {
  const storage = new FakeStorage();
  let fetchCalls = 0;

  await withFakeLocalStorage(storage, async () => {
    const persistly = await PersistlyGameSaves.start({
      runtimeKey: "ps_test_example",
      storage: "localStorage",
      playerRef: "player-184",
      externalProfileRef: { provider: "auth0", subject: "auth0|abc123" },
      fetch: async () => {
        fetchCalls += 1;
        return createJsonResponse(500, {});
      },
    });

    await persistly.saveSlot("autosave", { coins: 42 });
  });

  assert.equal(fetchCalls, 0);
  assert.ok([...storage.values.keys()].some((key) => key.includes("auth0%3Aauth0%7Cabc123")));
});

test("ensureProfile creates profile-only and getProfileSession hides token unless requested", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const persistly = await PersistlyGameSaves.start({
    runtimeKey: "ps_test_example",
    storage: "memory",
    playerRef: "player-184",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return createJsonResponse(201, createProfileEnvelope());
    },
  });

  const ensured = await persistly.ensureProfile();
  const hiddenSession = await persistly.getProfileSession();
  const revealedSession = await persistly.getProfileSession({ includeToken: true });

  assert.equal(ensured.profileSaveId, "sv_profile");
  assert.equal("profileSessionToken" in ensured, false);
  assert.equal(hiddenSession.profileSessionToken, undefined);
  assert.equal(revealedSession.profileSessionToken, "pst_session");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    playerRef: "player-184",
    accountData: {},
  });
});

test("saveSlot, loadSlot, listSlots, and inspectSlot are local-first", async () => {
  let fetchCalls = 0;
  const persistly = await PersistlyGameSaves.start({
    runtimeKey: "ps_test_example",
    storage: "memory",
    fetch: async () => {
      fetchCalls += 1;
      return createJsonResponse(500, {});
    },
  });

  const saved = await persistly.saveSlot("autosave", { coins: 42 }, { metadata: { characterName: "Ayla" } });
  const loaded = await persistly.loadSlot("autosave");
  const missing = await persistly.loadSlot("manual");
  const listed = await persistly.listSlots();
  const inspected = await persistly.inspectSlot("autosave");

  assert.equal(saved.status, PersistlyGameSaveStatus.LocalSaved);
  assert.equal(loaded.status, PersistlyGameSaveStatus.LocalFound);
  assert.deepEqual(loaded.state, { coins: 42 });
  assert.equal(missing.status, PersistlyGameSaveStatus.NotFound);
  assert.deepEqual(listed.map((slot) => slot.slotKey), ["autosave"]);
  assert.equal(inspected.dirty, true);
  assert.equal(fetchCalls, 0);
});

test("saveSlot rejects developer-supplied reserved metadata", async () => {
  const persistly = await PersistlyGameSaves.start({
    runtimeKey: "ps_test_example",
    storage: "memory",
  });

  await assert.rejects(
    () => persistly.saveSlot("autosave", { coins: 42 }, { metadata: { _persistly: { slotKey: "autosave" } } }),
    /reserved for Persistly/,
  );
});

test("first slot sync creates profile with initial character", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const callbacks: PersistlyGameSaveSyncResult[] = [];
  const character = createSave("sv_character", { coins: 42 }, 1, {
    _persistly: { slotKey: "autosave" },
    characterName: "Ayla",
  });
  const persistly = await PersistlyGameSaves.start({
    runtimeKey: "ps_test_example",
    storage: "memory",
    playerRef: "player-184",
    onSyncResult: (result) => callbacks.push(result),
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return createJsonResponse(201, createProfileEnvelope(character));
    },
  });

  await persistly.saveSlot("autosave", { coins: 42 }, { metadata: { characterName: "Ayla" } });
  const result = await persistly.forceSync("autosave", { bypassCooldown: true });
  const inspected = await persistly.inspectSlot("autosave");

  assert.equal(result.status, PersistlyGameSaveStatus.Synced);
  assert.equal(result.target, PersistlyGameSaveTarget.Slot);
  assert.equal(inspected.characterSaveId, "sv_character");
  assert.equal(inspected.dirty, false);
  assert.equal(callbacks[0]?.target, PersistlyGameSaveTarget.Slot);
  assert.equal(requests[0]?.url, `${DEFAULT_PERSISTLY_API_BASE_URL}/api/v1/profiles`);
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    playerRef: "player-184",
    accountData: {},
    character: {
      metadata: {
        _persistly: { slotKey: "autosave" },
        characterName: "Ayla",
      },
      state: { coins: 42 },
    },
  });
});

test("existing profile plus new local slot creates a profile character", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const persistly = await PersistlyGameSaves.start({
    runtimeKey: "ps_test_example",
    storage: "memory",
    profileSaveId: "sv_profile",
    profileSessionToken: "pst_session",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      if (String(input).endsWith("/profiles/sv_profile")) {
        return createJsonResponse(200, {
          ...createProfileEnvelope(),
          profileSessionToken: undefined,
        });
      }
      return createJsonResponse(201, {
        ...createProfileEnvelope(createSave("sv_character", { level: 1 }, 1, { _persistly: { slotKey: "autosave" } })),
        profileSessionToken: undefined,
      });
    },
  });

  await persistly.saveSlot("autosave", { level: 1 });
  const result = await persistly.forceSync("autosave", { bypassCooldown: true });

  assert.equal(result.status, PersistlyGameSaveStatus.Synced);
  assert.equal(requests[0]?.url, `${DEFAULT_PERSISTLY_API_BASE_URL}/api/v1/profiles/sv_profile`);
  assert.equal(requests[1]?.url, `${DEFAULT_PERSISTLY_API_BASE_URL}/api/v1/profiles/sv_profile/characters`);
  assert.equal(new Headers(requests[1]?.init?.headers).get("x-persistly-profile-session"), "pst_session");
});

test("restored profile session loads real profile before sync operations", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const persistly = await PersistlyGameSaves.start({
    runtimeKey: "ps_test_example",
    storage: "memory",
    profileSaveId: "sv_profile",
    profileSessionToken: "pst_session",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });

      if (String(input).endsWith("/profiles/sv_profile")) {
        const { syncPolicy: _syncPolicy, ...envelope } = createProfileEnvelope();
        return createJsonResponse(200, {
          ...envelope,
          profileSessionToken: undefined,
          profile: createSave("sv_profile", {
            schema: "persistly.profile.v1",
            accountData: { diamonds: 777 },
            characterSlots: [],
          }, 8, { profileLabel: "Cloud" }),
        });
      }

      if (String(input).endsWith("/runtime-config")) {
        return createJsonResponse(200, {
          syncPolicy: {
            minRemoteSyncIntervalSeconds: 120,
            forceSyncCooldownSeconds: 30,
            syncOnAppBackground: true,
            syncOnAppForeground: true,
            syncOnReconnect: true,
            maxQueuedLocalSnapshots: 10,
          },
        });
      }

      return createJsonResponse(201, {
        ...createProfileEnvelope(createSave("sv_character", { level: 1 }, 1, { _persistly: { slotKey: "autosave" } })),
        profileSessionToken: undefined,
      });
    },
  });

  const ensured = await persistly.ensureProfile();
  await persistly.saveSlot("autosave", { level: 1 });
  const synced = await persistly.forceSync("autosave", { bypassCooldown: true });

  assert.equal(ensured.profile.version, 8);
  assert.deepEqual(ensured.profile.state.accountData, { diamonds: 777 });
  assert.equal(synced.status, PersistlyGameSaveStatus.Synced);
  assert.deepEqual(requests.map((request) => request.url), [
    `${DEFAULT_PERSISTLY_API_BASE_URL}/api/v1/profiles/sv_profile`,
    `${DEFAULT_PERSISTLY_API_BASE_URL}/api/v1/runtime-config`,
    `${DEFAULT_PERSISTLY_API_BASE_URL}/api/v1/profiles/sv_profile/characters`,
  ]);
});

test("account-data writes are local-first and forceSyncProfile syncs profile account data", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const persistly = await PersistlyGameSaves.start({
    runtimeKey: "ps_test_example",
    storage: "memory",
    profileSaveId: "sv_profile",
    profileSessionToken: "pst_session",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      if (String(input).endsWith("/profiles/sv_profile")) {
        return createJsonResponse(200, {
          ...createProfileEnvelope(),
          profileSessionToken: undefined,
          profile: createSave("sv_profile", {
            schema: "persistly.profile.v1",
            accountData: { diamonds: 900 },
            characterSlots: [],
          }, 7),
        });
      }
      return createJsonResponse(200, {
        status: PersistlySyncStatus.Accepted,
        version: 8,
        updatedAt: "2026-04-10T00:12:00Z",
        historyRetained: false,
        warnings: ["near_monthly_request_quota"],
      });
    },
  });

  assert.equal((await persistly.saveAccountData({ diamonds: 1200 })).status, PersistlyGameSaveStatus.LocalSaved);
  assert.equal((await persistly.patchAccountData({ diamonds: 1300, unlockedSlots: 4 })).status, PersistlyGameSaveStatus.LocalSaved);
  const result = await persistly.forceSyncProfile({ bypassCooldown: true });

  assert.equal(result.status, PersistlyGameSaveStatus.Synced);
  assert.equal(result.historyRetained, false);
  assert.deepEqual(result.warnings, ["near_monthly_request_quota"]);
  assert.equal(result.profile?.version, 8);
  assert.equal(requests[0]?.url, `${DEFAULT_PERSISTLY_API_BASE_URL}/api/v1/profiles/sv_profile`);
  assert.equal(requests[1]?.url, `${DEFAULT_PERSISTLY_API_BASE_URL}/api/v1/profiles/sv_profile/account-data/sync`);
  assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), {
    baseVersion: 7,
    accountData: { diamonds: 1300, unlockedSlots: 4 },
  });
});

test("profile account-data conflicts persist cloud state separately from local state", async () => {
  const storage = new FakeStorage();

  await withFakeLocalStorage(storage, async () => {
    const persistly = await PersistlyGameSaves.start({
      runtimeKey: "ps_test_example",
      storage: "localStorage",
      localProfileKey: "profile",
      profileSaveId: "sv_profile",
      profileSessionToken: "pst_session",
      fetch: async (input) => {
        if (String(input).endsWith("/profiles/sv_profile")) {
          return createJsonResponse(200, {
            ...createProfileEnvelope(),
            profileSessionToken: undefined,
          });
        }

        return createJsonResponse(409, {
          status: PersistlySyncStatus.Conflict,
          save: createSave("sv_profile", {
            schema: "persistly.profile.v1",
            accountData: { diamonds: 900 },
            characterSlots: [],
          }, 4, { profileLabel: "Cloud" }),
          details: { reason: "base_version_mismatch" },
        });
      },
    });

    await persistly.saveAccountData({ diamonds: 1200 });
    const result = await persistly.forceSyncProfile({ bypassCooldown: true });

    assert.equal(result.status, PersistlyGameSaveStatus.Conflict);
  });

  const profileValue = [...storage.values.entries()].find(([key]) => key.endsWith(":profile"))?.[1];
  assert.ok(profileValue);
  const profile = JSON.parse(profileValue);
  assert.deepEqual(profile.accountData, { diamonds: 1200 });
  assert.deepEqual(profile.cloudAccountData, { diamonds: 900 });
  assert.deepEqual(profile.cloudMetadata, { profileLabel: "Cloud" });
  assert.equal(profile.cloudVersion, 4);
  assert.equal(profile.dirty, true);
});

test("slot conflicts preserve local and cloud separately and helpers resolve explicitly", async () => {
  let syncCalls = 0;
  const persistly = await PersistlyGameSaves.start({
    runtimeKey: "ps_test_example",
    storage: "memory",
    profileSaveId: "sv_profile",
    profileSessionToken: "pst_session",
    fetch: async (input) => {
      const url = String(input);
      if (url.endsWith("/profiles/sv_profile")) {
        return createJsonResponse(200, {
          ...createProfileEnvelope(),
          profileSessionToken: undefined,
        });
      }

      syncCalls += 1;
      if (url.endsWith("/characters") && syncCalls === 1) {
        return createJsonResponse(201, {
          ...createProfileEnvelope(createSave("sv_character", { coins: 10 }, 1, { _persistly: { slotKey: "autosave" } })),
          profileSessionToken: undefined,
        });
      }
      if (url.endsWith("/characters/sv_character/sync") && syncCalls === 2) {
        return createJsonResponse(409, {
          status: PersistlySyncStatus.Conflict,
          save: createSave("sv_character", { coins: 20 }, 3, { _persistly: { slotKey: "autosave" } }),
          details: { reason: "base_version_mismatch" },
        });
      }
      return createJsonResponse(200, {
        status: PersistlySyncStatus.Accepted,
        save: createSave("sv_character", { coins: 30 }, 4, { _persistly: { slotKey: "autosave" } }),
      });
    },
  });

  await persistly.saveSlot("autosave", { coins: 10 });
  await persistly.forceSync("autosave", { bypassCooldown: true });
  await persistly.saveSlot("autosave", { coins: 30 });
  const conflict = await persistly.forceSync("autosave", { bypassCooldown: true });

  assert.equal(conflict.status, PersistlyGameSaveStatus.Conflict);
  assert.deepEqual(conflict.localState, { coins: 30 });
  assert.deepEqual(conflict.cloudState, { coins: 20 });
  assert.equal((await persistly.keepLocalForLater("autosave")).status, PersistlyGameSaveStatus.LocalSaved);
  assert.equal((await persistly.acceptCloudVersion("autosave")).status, PersistlyGameSaveStatus.Synced);
  assert.deepEqual((await persistly.loadSlot("autosave")).state, { coins: 20 });

  await persistly.saveSlot("autosave", { coins: 30 });
  assert.equal((await persistly.overwriteCloudVersion("autosave", { bypassCooldown: true })).status, PersistlyGameSaveStatus.Synced);
});

test("archiveSlot archives remotely before marking local archived and clearLocalSlot is local-only", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const persistly = await PersistlyGameSaves.start({
    runtimeKey: "ps_test_example",
    storage: "memory",
    profileSaveId: "sv_profile",
    profileSessionToken: "pst_session",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      if (String(input).endsWith("/profiles/sv_profile")) {
        return createJsonResponse(200, {
          ...createProfileEnvelope(),
          profileSessionToken: undefined,
        });
      }
      if (String(input).endsWith("/archive")) {
        return createJsonResponse(200, createProfileEnvelope());
      }
      return createJsonResponse(201, {
        ...createProfileEnvelope(createSave("sv_character", { coins: 10 }, 1, { _persistly: { slotKey: "autosave" } })),
        profileSessionToken: undefined,
      });
    },
  });

  await persistly.saveSlot("autosave", { coins: 10 });
  await persistly.forceSync("autosave", { bypassCooldown: true });
  const archived = await persistly.archiveSlot("autosave");
  const inspected = await persistly.inspectSlot("autosave");
  const callsAfterArchive = requests.length;
  await persistly.clearLocalSlot("autosave");

  assert.equal(archived.status, PersistlyGameSaveStatus.Synced);
  assert.equal(inspected.archived, true);
  assert.ok(requests.some((request) => request.url.endsWith("/profiles/sv_profile/characters/sv_character/archive")));
  assert.equal(requests.length, callsAfterArchive);
  assert.equal((await persistly.loadSlot("autosave")).status, PersistlyGameSaveStatus.NotFound);
});

test("saving an archived slot creates a new character instead of reusing archived save id", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const persistly = await PersistlyGameSaves.start({
    runtimeKey: "ps_test_example",
    storage: "memory",
    profileSaveId: "sv_profile",
    profileSessionToken: "pst_session",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      if (String(input).endsWith("/profiles/sv_profile")) {
        return createJsonResponse(200, {
          ...createProfileEnvelope(),
          profileSessionToken: undefined,
        });
      }
      if (String(input).endsWith("/archive")) {
        return createJsonResponse(200, createProfileEnvelope());
      }
      if (String(input).endsWith("/characters") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        return createJsonResponse(201, {
          ...createProfileEnvelope(createSave(body.state.level === 1 ? "sv_character_old" : "sv_character_new", body.state, 1, body.metadata)),
          profileSessionToken: undefined,
        });
      }
      throw new Error(`Unexpected request ${String(input)}`);
    },
  });

  await persistly.saveSlot("autosave", { level: 1 });
  await persistly.forceSync("autosave", { bypassCooldown: true });
  await persistly.archiveSlot("autosave");
  await persistly.saveSlot("autosave", { level: 2 });
  const result = await persistly.forceSync("autosave", { bypassCooldown: true });
  const inspected = await persistly.inspectSlot("autosave");

  assert.equal(result.status, PersistlyGameSaveStatus.Synced);
  assert.equal(inspected.characterSaveId, "sv_character_new");
  assert.equal(
    requests.filter((request) => request.url.endsWith("/profiles/sv_profile/characters")).length,
    2,
  );
  assert.equal(
    requests.some((request) => request.url.endsWith("/profiles/sv_profile/characters/sv_character_old/sync")),
    false,
  );
});

test("localStorage records reject unknown persisted schemas", async () => {
  const storage = new FakeStorage();

  await withFakeLocalStorage(storage, async () => {
    const persistly = await PersistlyGameSaves.start({
      runtimeKey: "ps_test_example",
      storage: "localStorage",
      localProfileKey: "profile",
    });
    await persistly.saveAccountData({ diamonds: 1 });
  });

  const profileKey = [...storage.values.keys()].find((key) => key.endsWith(":profile"));
  assert.ok(profileKey);
  storage.setItem(profileKey, JSON.stringify({ schema: "persistly.unknown.v1" }));

  await withFakeLocalStorage(storage, async () => {
    const persistly = await PersistlyGameSaves.start({
      runtimeKey: "ps_test_example",
      storage: "localStorage",
      localProfileKey: "profile",
    });

    await assert.rejects(() => persistly.ensureProfile(), PersistlyStorageError);
  });
});
