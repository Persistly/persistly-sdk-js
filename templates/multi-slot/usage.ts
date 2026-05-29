import {
  configurePersistly,
  listSavedSlots,
  loadSlot,
  saveSlot,
  syncSlot,
  type SlotId,
} from "./persistly-save-service.js";

await configurePersistly("ps_test_replace_me");

const selectedSlot: SlotId = "campaign-1";
const existing = await loadSlot(selectedSlot);
const state = existing ?? { level: 1, coins: 0, quest: "harbor" };

await saveSlot(selectedSlot, { ...state, coins: Number(state.coins ?? 0) + 50 }, "Campaign 1");
await syncSlot(selectedSlot);

const slots = await listSavedSlots();
console.log("Saved slot count:", slots.length);
