import {
  configurePersistly,
  connectFirebase,
  saveGame,
  switchToProviderAccount,
  syncGame,
} from "./persistly-save-service";

await configurePersistly("ps_test_replace_me");

await saveGame({
  level: 3,
  coins: 250,
  checkpoint: "meadow-gate",
});
await syncGame();

// Get this from Firebase Auth in your game. Use the matching Supabase or Auth0
// connect helper when those SDKs provide the token instead.
const firebaseIdToken = "firebase_id_token_from_your_login_flow";
const result = await connectFirebase(firebaseIdToken);

if (result === "conflict") {
  // account_auth_conflict means the provider is already linked elsewhere.
  // Local anonymous progress is still present. Only switch after confirmation.
  const playerConfirmedSwitch = false;
  if (playerConfirmedSwitch) {
    await switchToProviderAccount(firebaseIdToken);
  }
}
