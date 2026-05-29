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
  accountData: { diamonds: 0 },
  slot: {
    slotId: "main",
    slotInfo: { characterName: "Ayla" },
    data: { gold: 100, level: 1 },
  },
});

const staleVersion = created.slot?.version ?? 1;

await client.syncAccountSlot({
  accountId: created.accountId,
  accountSessionToken: created.accountSessionToken,
  slotId: "main",
  baseVersion: staleVersion,
  slotInfo: { characterName: "Ayla", level: 3 },
  data: { gold: 140, level: 3 },
});

const conflict = await client.syncAccountSlot({
  accountId: created.accountId,
  accountSessionToken: created.accountSessionToken,
  slotId: "main",
  baseVersion: staleVersion,
  slotInfo: { characterName: "Ayla", level: 99 },
  data: { gold: 999, level: 99 },
});

if (conflict.status === PersistlySyncStatus.Conflict) {
  console.log(conflict.status, conflict.save.version);
}
