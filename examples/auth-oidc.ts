import {
  PersistlyGameSaveStatus,
  PersistlyGameSaves,
} from "@persistlyapp/sdk";

await PersistlyGameSaves.configure({
  runtimeKey: "ps_test_replace_me",
  accountMode: "authRequired",
});

// Get this token from your configured OIDC/JWT provider.
const providerToken = "OIDC_JWT_PLACEHOLDER";

await PersistlyGameSaves.shared.signInWithProvider({
  provider: "oidc_jwt",
  token: providerToken,
  deviceLabel: "Web client",
});

await PersistlyGameSaves.shared.saveSlot("mage", {
  level: 12,
  coins: 1750,
  inventorySlots: 18,
}, {
  slotInfo: {
    characterName: "Astra",
    className: "Mage",
    level: 12,
  },
});

const sync = await PersistlyGameSaves.shared.forceSync("mage");

if (sync.status === PersistlyGameSaveStatus.Synced) {
  console.log("OIDC-authenticated slot synced.");
}
