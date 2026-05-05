import { PersistlyGameSaves, PersistlySlotStatus } from "../src/index.js";

await PersistlyGameSaves.configure({
  runtimeKey: "ps_test_replace_me",
  storage: "localStorage",
  syncIntervalSeconds: 40,
});

const result = await PersistlyGameSaves.shared.saveSlot("autosave", {
  level: 5,
  coins: 1200,
});

if (result.status === PersistlySlotStatus.LocalSaved) {
  console.log("Saved locally. Persistly will sync when allowed.");
}
