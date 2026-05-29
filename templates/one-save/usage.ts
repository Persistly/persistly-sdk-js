import {
  configurePersistly,
  loadGame,
  saveGame,
  syncGame,
  type PlayerSaveData,
} from "./persistly-save-service.js";

await configurePersistly("ps_test_replace_me");

const existing = await loadGame();
const state: PlayerSaveData = existing ?? {
  level: 1,
  coins: 0,
  checkpoint: "start",
};

state.coins = Number(state.coins ?? 0) + 25;
await saveGame(state);

// Call this from a deliberate sync point, not every frame.
await syncGame();
