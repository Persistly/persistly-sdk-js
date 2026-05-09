import { MemorySaveCache, PersistlyClient, PersistlySyncStatus } from "@persistly/sdk";

const runtimeKey = process.env.PERSISTLY_RUNTIME_KEY;

if (!runtimeKey) {
  throw new Error("Set PERSISTLY_RUNTIME_KEY before running this example.");
}

const client = new PersistlyClient({
  runtimeKey,
  cache: new MemorySaveCache(),
});

const created = await client.createProfile({
  playerRef: "example-player",
  accountData: { diamonds: 0 },
  character: {
    metadata: { _persistly: { slotKey: "main" }, characterName: "Ayla" },
    state: { gold: 100, level: 1 },
  },
});

if (!created.character) {
  throw new Error("Expected example profile creation to include an initial character.");
}

const staleVersion = created.character.version;
const profileSaveId = created.profileSaveId;
const profileSessionToken = created.profileSessionToken;
const characterSaveId = created.character.saveId;

await client.syncProfileCharacter({
  profileSaveId,
  profileSessionToken,
  characterSaveId,
  baseVersion: created.character.version,
  metadata: created.character.metadata,
  state: { gold: 140, level: 3 },
});

const conflict = await client.syncProfileCharacter({
  profileSaveId,
  profileSessionToken,
  characterSaveId,
  baseVersion: staleVersion,
  metadata: created.character.metadata,
  state: { gold: 999, level: 99 },
});

if (conflict.status === PersistlySyncStatus.Conflict) {
  console.log(conflict.status, conflict.save.version);
}
