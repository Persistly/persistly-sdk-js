export const PersistlySlotStatus = {
  LocalSaved: "local_saved",
  Synced: "synced",
  Conflict: "conflict",
  Offline: "offline",
  RateLimited: "rate_limited",
} as const;

export type PersistlySlotStatusValue =
  (typeof PersistlySlotStatus)[keyof typeof PersistlySlotStatus];

export type PersistlySlotResult =
  | { status: typeof PersistlySlotStatus.LocalSaved; slotKey: string }
  | { status: typeof PersistlySlotStatus.Synced; slotKey: string; save: unknown }
  | {
      status: typeof PersistlySlotStatus.Conflict;
      slotKey: string;
      localState: unknown;
      cloudSave: unknown;
    }
  | { status: typeof PersistlySlotStatus.Offline; slotKey: string }
  | {
      status: typeof PersistlySlotStatus.RateLimited;
      slotKey: string;
      retryAfterSeconds?: number;
    };

class UnconfiguredPersistlyGameSaves {
  async loadSlot(): Promise<never> {
    throw new Error("not_configured: call PersistlyGameSaves.configure() first");
  }

  async saveSlot(): Promise<never> {
    throw new Error("not_configured: call PersistlyGameSaves.configure() first");
  }

  async forceSync(): Promise<never> {
    throw new Error("not_configured: call PersistlyGameSaves.configure() first");
  }
}

export class PersistlyGameSaves {
  static shared: {
    loadSlot(slotKey: string): Promise<unknown>;
    saveSlot(slotKey: string, state: unknown): Promise<unknown>;
    forceSync(slotKey: string): Promise<unknown>;
  } = new UnconfiguredPersistlyGameSaves();
}
