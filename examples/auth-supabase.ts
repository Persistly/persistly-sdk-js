import {
  PersistlyGameSaveStatus,
  PersistlyGameSaves,
} from "@persistlyapp/sdk";

await PersistlyGameSaves.configure({
  runtimeKey: "ps_test_replace_me",
  accountMode: "authRequired",
});

// Get this access token from Supabase Auth in your game client.
const supabaseAccessToken = "SUPABASE_ACCESS_TOKEN_PLACEHOLDER";

await PersistlyGameSaves.shared.signInWithSupabaseToken(supabaseAccessToken, {
  deviceLabel: "Browser",
});

await PersistlyGameSaves.shared.saveData({
  level: 3,
  coins: 240,
  checkpoint: "harbor",
});

const sync = await PersistlyGameSaves.shared.forceSyncData();

if (sync.status === PersistlyGameSaveStatus.Synced) {
  console.log("Supabase-authenticated save synced.");
}
