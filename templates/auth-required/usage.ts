import {
  configurePersistly,
  loadGame,
  saveGame,
  signInWithGoogle,
  signOut,
  syncGame,
  type PlayerSaveData,
} from "./persistly-save-service.js";

await configurePersistly("ps_test_replace_me");

// Replace with the ID token returned by your Google Sign-In flow.
await signInWithGoogle("GOOGLE_ID_TOKEN_PLACEHOLDER", "Browser");

const existing = await loadGame();
const state: PlayerSaveData = existing ?? {
  level: 1,
  coins: 0,
  checkpoint: "start",
};

state.coins = Number(state.coins ?? 0) + 25;
await saveGame(state);
await syncGame();

async function handlePlayerSignOut(): Promise<void> {
  await signOut();
  showSignInScreen();
}

function showSignInScreen(): void {
  // Return the player to your login screen.
}

void handlePlayerSignOut;
