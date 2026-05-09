import test from "node:test";
import assert from "node:assert/strict";

import {
  PersistlyProfileSchema,
  addCharacterToProfileState,
  buildProfileState,
  isPersistlyProfileState,
  type SaveSnapshot,
} from "../src/index.js";

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
    characterSlots: [
      {
        slotKey: "autosave",
        characterSaveId: "sv_character",
        metadata: { characterName: "Ayla" },
      },
    ],
  });

  assert.deepEqual(state, {
    schema: PersistlyProfileSchema,
    accountData: { diamonds: 1200 },
    characterSlots: [
      {
        slotKey: "autosave",
        characterSaveId: "sv_character",
        metadata: { characterName: "Ayla" },
      },
    ],
  });
  assert.equal(isPersistlyProfileState(state), true);
  assert.equal(isPersistlyProfileState({ schema: PersistlyProfileSchema, accountData: {}, characters: [] }), false);
  assert.equal(isPersistlyProfileState({ schema: PersistlyProfileSchema, accountData: {}, characterSlots: [{ metadata: {} }] }), false);
});

test("addCharacterToProfileState returns a cloned profile state with the character reference", () => {
  const initial = buildProfileState({ accountData: { diamonds: 50 } });
  const updated = addCharacterToProfileState(initial, characterSave, "autosave");

  assert.deepEqual(initial.characterSlots, []);
  assert.deepEqual(updated.characterSlots, [
    {
      slotKey: "autosave",
      characterSaveId: characterSave.saveId,
      metadata: characterSave.metadata,
    },
  ]);
});
