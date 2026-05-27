import { MemorySaveCache, PersistlyClient, PersistlySyncStatus } from "@persistlyapp/sdk";

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
  accountData: { diamonds: 0, tutorialComplete: false },
  character: {
    metadata: { _persistly: { slotKey: "main" }, characterName: "Ayla" },
    state: { gold: 100, level: 1 },
  },
});

// Store the profile session in your own trusted account backend or durable local save store.
// Do not log or expose profileSessionToken in player UI, telemetry, or support screenshots.
const profileSaveId = created.profileSaveId;
const profileSessionToken = created.profileSessionToken;
const characterSaveId = created.character?.saveId;

if (!created.character || !characterSaveId) {
  throw new Error("Expected example profile creation to include an initial character.");
}

const updated = await client.syncProfileCharacter({
  profileSaveId,
  profileSessionToken,
  characterSaveId,
  baseVersion: created.character.version,
  metadata: created.character.metadata,
  state: { gold: 125, level: 2 },
});

const local = await client.getLocal(characterSaveId);

if (updated.status === PersistlySyncStatus.Accepted) {
  await client.updateLocal(updated.save);
}

console.log(updated.status, updated.save.version, local?.version);
