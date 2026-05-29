import { MemorySaveCache, PersistlyClient, PersistlySyncStatus } from "@persistlyapp/sdk";

const runtimeKey = process.env.PERSISTLY_RUNTIME_KEY;

if (!runtimeKey) {
  throw new Error("Set PERSISTLY_RUNTIME_KEY before running this example.");
}

const client = new PersistlyClient({
  runtimeKey,
  cache: new MemorySaveCache(),
});

const created = await client.createAccount({
  playerRef: "example-player",
  accountData: { diamonds: 0, tutorialComplete: false },
  slot: {
    slotId: "main",
    slotInfo: { characterName: "Ayla" },
    data: { gold: 100, level: 1 },
  },
});

const updated = await client.syncAccountSlot({
  accountId: created.accountId,
  accountSessionToken: created.accountSessionToken,
  slotId: "main",
  baseVersion: created.slot?.version,
  slotInfo: { characterName: "Ayla", level: 2 },
  data: { gold: 125, level: 2 },
});

if (updated.status === PersistlySyncStatus.Accepted) {
  await client.updateLocal(updated.save);
}

console.log(updated.status, updated.save.version);
