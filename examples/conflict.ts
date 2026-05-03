import { MemorySaveCache, PersistlyClient, PersistlySyncStatus } from "@persistly/sdk-js";

const runtimeKey = process.env.PERSISTLY_RUNTIME_KEY;

if (!runtimeKey) {
  throw new Error("Set PERSISTLY_RUNTIME_KEY before running this example.");
}

const client = new PersistlyClient({
  runtimeKey,
  cache: new MemorySaveCache(),
});

const created = await client.createSave({
  externalUserId: "auth0|example-user",
  metadata: { characterName: "Ayla", slot: 1 },
  state: { gold: 100, level: 1 },
});

const staleVersion = created.version;

await client.syncSave(created.saveId, {
  state: { gold: 140, level: 3 },
});

const conflict = await client.syncSave(created.saveId, {
  baseVersion: staleVersion,
  state: { gold: 999, level: 99 },
});

if (conflict.status === PersistlySyncStatus.Conflict) {
  console.log(conflict.status, conflict.save.version);
}
