import {
  PersistlyGameSaveStatus,
  PersistlyGameSaves,
  type JsonObject,
  type PersistlyAuthProvider,
} from "@persistlyapp/sdk";

export type PlayerSaveData = JsonObject;

export async function configurePersistly(runtimeKey: string): Promise<void> {
  await PersistlyGameSaves.configure({
    runtimeKey,
    accountMode: "authRequired",
  });
}

export async function signInWithGoogle(idToken: string, deviceLabel?: string): Promise<void> {
  await PersistlyGameSaves.shared.signInWithGoogleIdToken(idToken, {
    ...(deviceLabel === undefined ? {} : { deviceLabel }),
  });
}

export async function signInWithProvider(
  provider: PersistlyAuthProvider,
  token: string,
  deviceLabel?: string,
): Promise<void> {
  await PersistlyGameSaves.shared.signInWithProvider({
    provider,
    token,
    ...(deviceLabel === undefined ? {} : { deviceLabel }),
  });
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
  const result = await PersistlyGameSaves.shared.forceSyncData();
  if (result.status === PersistlyGameSaveStatus.AuthRequired) {
    return { ...result, message: "Sign in before syncing this save to Persistly." };
  }
  return result;
}

export async function signOut(): Promise<void> {
  await PersistlyGameSaves.shared.signOut();
}
