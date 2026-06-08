import {
  PersistlyGameSaveStatus,
  PersistlyGameSaves,
} from "@persistlyapp/sdk";

await PersistlyGameSaves.configure({
  runtimeKey: "ps_test_replace_me",
  accountMode: "authRequired",
});

// Get this token from Firebase Auth in your game client.
const firebaseIdToken = "FIREBASE_ID_TOKEN_PLACEHOLDER";

await PersistlyGameSaves.shared.signInWithFirebaseToken(firebaseIdToken, {
  deviceLabel: "Browser",
});

await PersistlyGameSaves.shared.saveData({
  level: 3,
  coins: 240,
  checkpoint: "harbor",
});

const sync = await PersistlyGameSaves.shared.forceSyncData();

if (sync.status === PersistlyGameSaveStatus.Synced) {
  console.log("Firebase-authenticated save synced.");
}
