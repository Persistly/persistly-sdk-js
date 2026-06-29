import { PersistlyAccountAuthConflictError, PersistlyGameSaves } from "@persistlyapp/sdk";

export type GameSave = {
  level: number;
  coins: number;
  checkpoint: string;
};

export async function configurePersistly(runtimeKey: string): Promise<void> {
  await PersistlyGameSaves.configure({
    runtimeKey,
    storage: "localStorage",
    localAccountKey: "current-player",
  });
}

export async function saveGame(data: GameSave): Promise<void> {
  await PersistlyGameSaves.shared.saveData(data, {
    slotInfo: {
      level: data.level,
      checkpoint: data.checkpoint,
    },
  });
}

export async function syncGame(): Promise<void> {
  await PersistlyGameSaves.shared.forceSyncData({ bypassCooldown: true });
}

export async function connectFirebase(firebaseIdToken: string): Promise<"connected" | "conflict"> {
  try {
    // The token comes from Firebase Auth in your game, not from Persistly.
    // Normal save/load/sync calls do not receive or store this token.
    await PersistlyGameSaves.shared.connectWithFirebaseToken(firebaseIdToken, {
      deviceLabel: navigator.userAgent,
    });
    return "connected";
  } catch (error) {
    if (error instanceof PersistlyAccountAuthConflictError) {
      return "conflict";
    }
    throw error;
  }
}

export async function switchToProviderAccount(firebaseIdToken: string): Promise<void> {
  // Only call this after the player confirms replacing this device's local progress.
  await PersistlyGameSaves.shared.clearLocalAccount();
  await PersistlyGameSaves.shared.signInWithFirebaseToken(firebaseIdToken, {
    deviceLabel: navigator.userAgent,
  });
}
