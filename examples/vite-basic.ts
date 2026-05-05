import { PersistlyGameSaves, PersistlySlotStatus } from "@persistly/sdk-js";

await PersistlyGameSaves.configure({
  runtimeKey: import.meta.env.VITE_PERSISTLY_RUNTIME_KEY,
  storage: "localStorage",
});

await PersistlyGameSaves.shared.saveSlot("autosave", {
  checkpoint: "forest",
  coins: 25,
});

const result = await PersistlyGameSaves.shared.forceSync("autosave");

if (result.status === PersistlySlotStatus.Synced) {
  console.log("Cloud save synced.");
}
