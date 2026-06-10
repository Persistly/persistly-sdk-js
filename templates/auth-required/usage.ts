import {
  configurePersistly,
  loadGame,
  saveGame,
  signInWithFirebase,
  signInWithSupabase,
  signOut,
  syncGame,
  type PlayerSaveData,
} from "./persistly-save-service.js";

await configurePersistly("ps_test_replace_me");

// Replace with the ID token returned by Firebase Auth.
if (usesFirebaseAuth()) {
  await signInWithFirebase("FIREBASE_ID_TOKEN_PLACEHOLDER", "Browser");
}

// Or replace with the access token returned by Supabase Auth in Supabase-backed games.
if (usesSupabaseAuth()) {
  await signInWithSupabase("SUPABASE_ACCESS_TOKEN_PLACEHOLDER", "Browser");
}

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

function usesFirebaseAuth(): boolean {
  return true;
}

function usesSupabaseAuth(): boolean {
  return false;
}

void handlePlayerSignOut;
