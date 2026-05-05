import { PersistlyGameSaves, PersistlySlotStatus } from "@persistly/sdk-js";

await PersistlyGameSaves.configure({
  runtimeKey: import.meta.env.VITE_PERSISTLY_RUNTIME_KEY,
  storage: "localStorage",
});

const result = await PersistlyGameSaves.shared.forceSync("autosave");

if (result.status === PersistlySlotStatus.Synced) {
  console.log("Cloud save synced.");
}
