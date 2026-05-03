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

const updated = await client.syncSave(created.saveId, {
  state: { gold: 125, level: 2 },
});

const local = await client.getLocal(created.saveId);

if (updated.status === PersistlySyncStatus.Accepted) {
  await client.updateLocal({
    ...updated.save,
    metadata: {
      ...updated.save.metadata,
      lastScene: "village_square",
    },
  });
}

console.log(updated.status, updated.save.version, local?.version);
