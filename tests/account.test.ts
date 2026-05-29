import test from "node:test";
import assert from "node:assert/strict";

import {
  PersistlyAccountSchema,
  addSlotToAccountState,
  buildAccountState,
  isPersistlyAccountState,
} from "../src/index.js";

test("buildAccountState creates an account-first state shape", () => {
  const state = buildAccountState({
    accountData: { diamonds: 1200 },
    slots: [
      {
        slotId: "autosave",
        slotInfo: { characterName: "Ayla" },
      },
    ],
  });

  assert.deepEqual(state, {
    schema: PersistlyAccountSchema,
    accountData: { diamonds: 1200 },
    slots: [
      {
        slotId: "autosave",
        slotInfo: { characterName: "Ayla" },
      },
    ],
  });
  assert.equal(isPersistlyAccountState(state), true);
  assert.equal(isPersistlyAccountState({ schema: PersistlyAccountSchema, accountData: {}, characterSlots: [] }), false);
  assert.equal(isPersistlyAccountState({ schema: PersistlyAccountSchema, accountData: {}, slots: [{ slotInfo: {} }] }), false);
});

test("addSlotToAccountState returns a cloned account state with slot info", () => {
  const initial = buildAccountState({ accountData: { diamonds: 50 } });
  const updated = addSlotToAccountState(initial, "autosave", { characterName: "Ayla" });

  assert.deepEqual(initial.slots, []);
  assert.deepEqual(updated.slots, [
    {
      slotId: "autosave",
      slotInfo: { characterName: "Ayla" },
    },
  ]);
});
