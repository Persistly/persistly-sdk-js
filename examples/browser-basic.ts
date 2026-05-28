import { PersistlyGameSaveStatus, PersistlyGameSaves } from "../src/index.js";

await PersistlyGameSaves.configure({
  runtimeKey: "ps_test_replace_me",
});

const result = await PersistlyGameSaves.shared.saveSlot("autosave", {
  level: 5,
  coins: 1200,
});

if (result.status === PersistlyGameSaveStatus.LocalSaved) {
  console.log("Saved locally. Call forceSync or syncDue from a safe lifecycle moment.");
}
