import { PersistlyGameSaveStatus, PersistlyGameSaves } from "@persistlyapp/sdk";

await PersistlyGameSaves.configure({
  runtimeKey: import.meta.env.VITE_PERSISTLY_RUNTIME_KEY,
});

await PersistlyGameSaves.shared.saveData({
  checkpoint: "forest",
  coins: 25,
}, {
  slotInfo: { characterName: "Astra" },
});

const result = await PersistlyGameSaves.shared.forceSyncData();

if (result.status === PersistlyGameSaveStatus.Synced) {
  console.log("Cloud save synced.");
}
