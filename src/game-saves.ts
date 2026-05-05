import { PersistlyClient } from "./client.js";
import type { LocalStorageLike } from "./local-storage-cache.js";
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

interface SlotStore {
  get(slotKey: string): Promise<SlotRecord | undefined>;
  set(slot: SlotRecord): Promise<void>;
}

interface PersistlyGameSavesInternalOptions {
  storage?: LocalStorageLike;
  syncSlot?: (slotKey: string, slot: SlotRecord) => Promise<unknown>;
}

interface PersistlyGameSavesFacade {
  loadSlot(slotKey: string): Promise<SlotRecord | undefined>;
  saveSlot(slotKey: string, state: JsonObject): Promise<PersistlySlotResult>;
  forceSync(slotKey: string): Promise<PersistlySlotResult>;
  acceptCloudVersion(slotKey: string): Promise<PersistlySlotResult>;
  overwriteCloudVersion(slotKey: string): Promise<PersistlySlotResult>;
  keepLocalForLater(slotKey: string): Promise<PersistlySlotResult>;
}

class MemorySlotStore implements SlotStore {
  private readonly slots = new Map<string, SlotRecord>();

  async get(slotKey: string): Promise<SlotRecord | undefined> {
    const slot = this.slots.get(slotKey);
    return slot ? structuredClone(slot) : undefined;
  }

  async set(slot: SlotRecord): Promise<void> {
    this.slots.set(slot.slotKey, structuredClone(slot));
  }
}

class LocalStorageSlotStore implements SlotStore {
  private readonly storage: LocalStorageLike;
  private readonly keyPrefix: string;

  constructor(config: PersistlyGameSavesConfig, options: PersistlyGameSavesInternalOptions = {}) {
    const storage = options.storage ?? (globalThis as { localStorage?: LocalStorageLike }).localStorage;

    if (!storage) {
      throw new Error("PersistlyGameSaves localStorage storage requires browser localStorage or an explicit storage implementation.");
    }

    const ownerKey = config.playerRef ?? "anonymous";
    this.storage = storage;
    this.keyPrefix = `persistly:game-saves:${encodeURIComponent(config.runtimeKey)}:${encodeURIComponent(ownerKey)}:slot:`;
  }

  async get(slotKey: string): Promise<SlotRecord | undefined> {
    const value = this.storage.getItem(this.resolveKey(slotKey));
    if (value === null) {
      return undefined;
    }

    return normalizeSlotRecord(JSON.parse(value) as SlotRecord, slotKey);
  }

  async set(slot: SlotRecord): Promise<void> {
    const normalizedSlot = normalizeSlotRecord(slot, slot.slotKey);
    this.storage.setItem(this.resolveKey(normalizedSlot.slotKey), JSON.stringify(normalizedSlot));
  }

  private resolveKey(slotKey: string): string {
    return `${this.keyPrefix}${encodeURIComponent(slotKey)}`;
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

  async acceptCloudVersion(): Promise<never> {
    throw new Error("not_configured: call PersistlyGameSaves.configure() first");
  }

  async overwriteCloudVersion(): Promise<never> {
    throw new Error("not_configured: call PersistlyGameSaves.configure() first");
  }

  async keepLocalForLater(): Promise<never> {
    throw new Error("not_configured: call PersistlyGameSaves.configure() first");
  }
}

export class PersistlyGameSavesInstance implements PersistlyGameSavesFacade {
  private readonly client: PersistlyClient;
  private readonly playerRef: string | undefined;
  private readonly syncIntervalSeconds: number | undefined;
  private readonly slots: SlotStore;
  private readonly slotSync: (slotKey: string, slot: SlotRecord) => Promise<unknown>;

  constructor(config: PersistlyGameSavesConfig, options: unknown = {}) {
    const internalOptions = toInternalOptions(options);

    this.client = new PersistlyClient({ runtimeKey: config.runtimeKey });
    this.playerRef = config.playerRef;
    this.syncIntervalSeconds = config.syncIntervalSeconds;
    this.slots = createSlotStore(config, internalOptions);
    this.slotSync = internalOptions.syncSlot ?? (async (_slotKey, slot) => slot);
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
    const slot = await this.slots.get(slotKey);
    if (!slot?.dirtyState) {
      return { status: PersistlySlotStatus.LocalSaved, slotKey };
    }

    try {
      const save = await this.slotSync(slotKey, slot);
      return { status: PersistlySlotStatus.Synced, slotKey, save };
    } catch (error) {
      if (error instanceof Error && /rate/i.test(error.message)) {
        return { status: PersistlySlotStatus.RateLimited, slotKey };
      }
      if (error instanceof Error && /fetch|network|offline/i.test(error.message)) {
        return { status: PersistlySlotStatus.Offline, slotKey };
      }
      throw error;
    }
  }

  async acceptCloudVersion(slotKey: string): Promise<PersistlySlotResult> {
    const slot = await this.slots.get(slotKey);
    const nextSlot: SlotRecord = { slotKey };
    if (slot?.characterSaveId) {
      nextSlot.characterSaveId = slot.characterSaveId;
    }
    if (slot?.version !== undefined) {
      nextSlot.version = slot.version;
    }
    await this.slots.set(nextSlot);
    return { status: PersistlySlotStatus.Synced, slotKey, save: slot ?? { slotKey } };
  }

  async overwriteCloudVersion(slotKey: string): Promise<PersistlySlotResult> {
    const slot = await this.slots.get(slotKey);
    if (!slot?.dirtyState) {
      return { status: PersistlySlotStatus.LocalSaved, slotKey };
    }
    return this.forceSync(slotKey);
  }

  async keepLocalForLater(slotKey: string): Promise<PersistlySlotResult> {
    const slot = await this.slots.get(slotKey);
    if (!slot?.dirtyState) {
      return { status: PersistlySlotStatus.LocalSaved, slotKey };
    }
    return { status: PersistlySlotStatus.LocalSaved, slotKey };
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

function createSlotStore(config: PersistlyGameSavesConfig, options: PersistlyGameSavesInternalOptions): SlotStore {
  if ((config.storage ?? "memory") === "localStorage") {
    return new LocalStorageSlotStore(config, options);
  }

  return new MemorySlotStore();
}

function toInternalOptions(options: unknown): PersistlyGameSavesInternalOptions {
  if (options && typeof options === "object") {
    return options as PersistlyGameSavesInternalOptions;
  }

  return {};
}

function normalizeSlotRecord(slot: SlotRecord, fallbackSlotKey: string): SlotRecord {
  return structuredClone({
    ...slot,
    slotKey: slot.slotKey ?? fallbackSlotKey,
  });
}
