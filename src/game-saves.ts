import { PersistlyClient } from "./client.js";
import type { JsonObject } from "./schema.js";

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

export type PersistlyGameSavesStorage = "memory" | "localStorage";

export interface PersistlyGameSavesConfig {
  runtimeKey: string;
  playerRef?: string;
  storage?: PersistlyGameSavesStorage;
  syncIntervalSeconds?: number;
}

interface SlotRecord {
  slotKey: string;
  characterSaveId?: string;
  version?: number;
  dirtyState?: JsonObject;
}

interface PersistlyGameSavesFacade {
  loadSlot(slotKey: string): Promise<SlotRecord | undefined>;
  saveSlot(slotKey: string, state: JsonObject): Promise<PersistlySlotResult>;
  forceSync(slotKey: string): Promise<PersistlySlotResult>;
}

class MemorySlotStore {
  private readonly slots = new Map<string, SlotRecord>();

  async get(slotKey: string): Promise<SlotRecord | undefined> {
    const slot = this.slots.get(slotKey);
    return slot ? structuredClone(slot) : undefined;
  }

  async set(slot: SlotRecord): Promise<void> {
    this.slots.set(slot.slotKey, structuredClone(slot));
  }
}

class UnconfiguredPersistlyGameSaves implements PersistlyGameSavesFacade {
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

export class PersistlyGameSavesInstance implements PersistlyGameSavesFacade {
  private readonly client: PersistlyClient;
  private readonly playerRef: string | undefined;
  private readonly syncIntervalSeconds: number | undefined;
  private readonly slots = new MemorySlotStore();

  constructor(config: PersistlyGameSavesConfig) {
    this.client = new PersistlyClient({ runtimeKey: config.runtimeKey });
    this.playerRef = config.playerRef;
    this.syncIntervalSeconds = config.syncIntervalSeconds;
  }

  async loadSlot(slotKey: string): Promise<SlotRecord | undefined> {
    return await this.slots.get(slotKey);
  }

  async saveSlot(slotKey: string, state: JsonObject): Promise<PersistlySlotResult> {
    await this.slots.set({ slotKey, dirtyState: state });

    return {
      status: PersistlySlotStatus.LocalSaved,
      slotKey,
    };
  }

  async forceSync(slotKey: string): Promise<PersistlySlotResult> {
    return {
      status: PersistlySlotStatus.LocalSaved,
      slotKey,
    };
  }
}

export class PersistlyGameSaves {
  static shared: PersistlyGameSavesFacade = new UnconfiguredPersistlyGameSaves();

  static async start(config: PersistlyGameSavesConfig): Promise<PersistlyGameSavesInstance> {
    return new PersistlyGameSavesInstance(config);
  }

  static async configure(config: PersistlyGameSavesConfig): Promise<void> {
    PersistlyGameSaves.shared = await PersistlyGameSaves.start(config);
  }
}
