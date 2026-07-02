import {
  configurePersistly,
  connectFirebase,
  discardLocalAndUseProviderAccount,
  saveGame,
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
  // Local anonymous progress is still present. Safe options are:
  // - keep local progress and continue playing
  // - sign out of Firebase, choose a different Firebase account, then retry connectFirebase()
  // - discard local Persistly state on this device and use the existing provider-linked cloud account
  const playerConfirmedDiscardLocal = false;
  if (playerConfirmedDiscardLocal) {
    const freshFirebaseIdToken = "fresh_firebase_id_token_from_your_login_flow";
    await discardLocalAndUseProviderAccount(freshFirebaseIdToken);
  }
}
