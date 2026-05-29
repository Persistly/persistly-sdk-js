import {
  PersistlyGameSaves,
  type JsonObject,
} from "@persistlyapp/sdk";

export type AccountRestorePayload = {
  accountId: string;
  accountSessionToken: string;
};

export async function configurePersistly(runtimeKey: string): Promise<void> {
  await PersistlyGameSaves.configure({ runtimeKey });
}

export async function attachPersistlyAccount(payload: AccountRestorePayload): Promise<void> {
  await PersistlyGameSaves.shared.attachAccount(payload);
}

export async function exportPersistlyAccountForBackend(): Promise<AccountRestorePayload> {
  await PersistlyGameSaves.shared.ensureAccount();
  const session = await PersistlyGameSaves.shared.getAccountSession({
    includeToken: true,
  });

  if (!session.accountId || !session.accountSessionToken) {
    throw new Error("Persistly account session is not ready to export.");
  }

  return {
    accountId: session.accountId,
    accountSessionToken: session.accountSessionToken,
  };
}

export async function saveAccountSlot(slotId: string, data: JsonObject, label: string) {
  return await PersistlyGameSaves.shared.saveSlot(slotId, data, {
    slotInfo: { label },
  });
}

export async function loadAccountSlot(slotId: string) {
  return await PersistlyGameSaves.shared.loadSlot(slotId);
}

export async function syncAccountSlot(slotId: string) {
  return await PersistlyGameSaves.shared.forceSync(slotId);
}

