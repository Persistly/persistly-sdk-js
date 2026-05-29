import {
  PersistlyGameSaveStatus,
  PersistlyGameSaves,
  type JsonObject,
} from "@persistlyapp/sdk";

export type PlayerSaveData = JsonObject;

export async function configurePersistly(runtimeKey: string): Promise<void> {
  await PersistlyGameSaves.configure({ runtimeKey });
}

export async function loadGame(): Promise<PlayerSaveData | null> {
  const loaded = await PersistlyGameSaves.shared.loadData();
  return loaded.status === PersistlyGameSaveStatus.LocalFound
    ? loaded.data ?? null
    : null;
}

export async function saveGame(data: PlayerSaveData) {
  return await PersistlyGameSaves.shared.saveData(data);
}

export async function syncGame() {
  return await PersistlyGameSaves.shared.forceSyncData();
}

