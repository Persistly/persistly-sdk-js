import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_PERSISTLY_API_BASE_URL,
  PersistlyClient,
  PersistlyProfileCreationError,
  PersistlyProfileSchema,
  addCharacterToProfileState,
  buildProfileState,
  isPersistlyProfileState,
  type SaveSnapshot,
} from "../src/index.js";

function createJsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const characterSave: SaveSnapshot = {
  saveId: "sv_character",
  playerRef: "player-184",
  metadata: { characterName: "Ayla", slot: 1 },
  state: { level: 1 },
  version: 1,
  createdAt: "2026-04-09T10:00:00Z",
  updatedAt: "2026-04-09T10:00:00Z",
};

test("buildProfileState creates a valid profile state shape", () => {
  const state = buildProfileState({
    accountData: { diamonds: 1200 },
    characters: [
      {
        saveId: "sv_character",
        metadata: { characterName: "Ayla" },
      },
    ],
  });

  assert.deepEqual(state, {
    schema: PersistlyProfileSchema,
    accountData: { diamonds: 1200 },
    characters: [
      {
        saveId: "sv_character",
        metadata: { characterName: "Ayla" },
      },
    ],
  });
  assert.equal(isPersistlyProfileState(state), true);
  assert.equal(isPersistlyProfileState({ schema: PersistlyProfileSchema, accountData: {}, characters: [{ metadata: {} }] }), false);
});

test("addCharacterToProfileState returns a cloned profile state with the character reference", () => {
  const initial = buildProfileState({ accountData: { diamonds: 50 } });
  const updated = addCharacterToProfileState(initial, characterSave);

  assert.deepEqual(initial.characters, []);
  assert.deepEqual(updated.characters, [
    {
      saveId: characterSave.saveId,
      metadata: characterSave.metadata,
    },
  ]);
});

test("createProfileWithCharacter creates character first, then profile", async () => {
  const requests: Array<{ url: string; body: unknown }> = [];
  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    fetch: async (input, init) => {
      const body = JSON.parse(String(init?.body));
      requests.push({ url: String(input), body });

      if (requests.length === 1) {
        return createJsonResponse(201, { save: characterSave });
      }

      return createJsonResponse(201, {
        save: {
          saveId: "sv_profile",
          playerRef: "player-184",
          metadata: { profileLabel: "Main profile" },
          state: body.state,
          version: 1,
          createdAt: "2026-04-09T10:01:00Z",
          updatedAt: "2026-04-09T10:01:00Z",
        },
      });
    },
  });

  const result = await client.createProfileWithCharacter({
    playerRef: "player-184",
    profileMetadata: { profileLabel: "Main profile" },
    accountData: { diamonds: 1200 },
    characterMetadata: { characterName: "Ayla", slot: 1 },
    characterState: { level: 1 },
  });

  assert.equal(result.profileSaveId, "sv_profile");
  assert.equal(result.character.saveId, "sv_character");
  assert.deepEqual(result.profile.state.characters, [
    {
      saveId: "sv_character",
      metadata: { characterName: "Ayla", slot: 1 },
    },
  ]);
  assert.equal(requests[0]?.url, `${DEFAULT_PERSISTLY_API_BASE_URL}/api/v1/saves`);
  assert.equal(requests[1]?.url, `${DEFAULT_PERSISTLY_API_BASE_URL}/api/v1/saves`);
  assert.deepEqual(requests[0]?.body, {
    playerRef: "player-184",
    metadata: { characterName: "Ayla", slot: 1 },
    state: { level: 1 },
  });
  assert.deepEqual(requests[1]?.body, {
    playerRef: "player-184",
    metadata: { profileLabel: "Main profile" },
    state: {
      schema: PersistlyProfileSchema,
      accountData: { diamonds: 1200 },
      characters: [
        {
          saveId: "sv_character",
          metadata: { characterName: "Ayla", slot: 1 },
        },
      ],
    },
  });
});

test("createProfileWithCharacter preserves created character when profile creation fails", async () => {
  let createdCharacter = false;

  const client = new PersistlyClient({
    runtimeKey: "ps_test_runtime",
    fetch: async (_input, _init) => {
      if (!createdCharacter) {
        createdCharacter = true;
        return createJsonResponse(201, { save: characterSave });
      }

      return createJsonResponse(500, {
        error: {
          code: "server_error",
          message: "Profile failed.",
        },
      });
    },
  });

  await assert.rejects(
    () =>
      client.createProfileWithCharacter({
        playerRef: "player-184",
        accountData: {},
        characterMetadata: { characterName: "Ayla" },
        characterState: { level: 1 },
      }),
    (error) => {
      assert.ok(error instanceof PersistlyProfileCreationError);
      assert.equal(error.character.saveId, "sv_character");
      return true;
    },
  );
});
