import { MemorySaveCache, PersistlyClient, PersistlySyncStatus } from "@persistly/sdk-js";

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
  characterMetadata: { characterName: "Ayla", slot: "main" },
  characterState: { gold: 100, level: 1 },
});

// Store these in localStorage, IndexedDB, a save file, or your own backend.
const profileSaveId = created.profileSaveId;
const profileSessionToken = created.profileSessionToken;
const characterSaveId = created.character.saveId;

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
