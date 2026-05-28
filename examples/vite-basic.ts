import { PersistlyGameSaveStatus, PersistlyGameSaves } from "@persistlyapp/sdk";

await PersistlyGameSaves.configure({
  runtimeKey: import.meta.env.VITE_PERSISTLY_RUNTIME_KEY,
});

await PersistlyGameSaves.shared.saveSlot("autosave", {
  checkpoint: "forest",
  coins: 25,
});

const result = await PersistlyGameSaves.shared.forceSync("autosave");

if (result.status === PersistlyGameSaveStatus.Synced) {
  console.log("Cloud save synced.");
}
