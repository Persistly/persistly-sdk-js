import {
  PersistlyGameSaveStatus,
  PersistlyGameSaves,
  type JsonObject,
} from "@persistlyapp/sdk";

export type SlotId = "campaign-1" | "campaign-2" | "challenge";
export type SlotSaveData = JsonObject;

export async function configurePersistly(runtimeKey: string): Promise<void> {
  await PersistlyGameSaves.configure({ runtimeKey });
}

export async function listSavedSlots() {
  return await PersistlyGameSaves.shared.listSlots();
}

export async function loadSlot(slotId: SlotId): Promise<SlotSaveData | null> {
  const loaded = await PersistlyGameSaves.shared.loadSlot(slotId);
  return loaded.status === PersistlyGameSaveStatus.LocalFound
    ? loaded.data ?? null
    : null;
}

export async function saveSlot(slotId: SlotId, data: SlotSaveData, label: string) {
  return await PersistlyGameSaves.shared.saveSlot(slotId, data, {
    slotInfo: {
      label,
      updatedBy: "game-client",
    },
  });
}

export async function syncSlot(slotId: SlotId) {
  return await PersistlyGameSaves.shared.forceSync(slotId);
}

