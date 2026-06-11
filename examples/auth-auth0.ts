import {
  PersistlyGameSaveStatus,
  PersistlyGameSaves,
} from "@persistlyapp/sdk";

await PersistlyGameSaves.configure({
  runtimeKey: "ps_test_replace_me",
  accountMode: "authRequired",
});

// Get this ID token or configured-audience access token from Auth0 in your game client.
const auth0Token = "AUTH0_TOKEN_PLACEHOLDER";

await PersistlyGameSaves.shared.signInWithAuth0Token(auth0Token, {
  deviceLabel: "Browser",
});

await PersistlyGameSaves.shared.saveData({
  level: 3,
  coins: 240,
  checkpoint: "harbor",
});

const sync = await PersistlyGameSaves.shared.forceSyncData();

if (sync.status === PersistlyGameSaveStatus.Synced) {
  console.log("Auth0-authenticated save synced.");
}
