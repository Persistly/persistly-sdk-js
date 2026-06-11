export type PersistlyAccountMode = "anonymousFirst" | "authRequired";

export type PersistlyAuthProvider = "firebase" | "supabase" | "auth0";

export interface PersistlyAuthOptions {
  deviceLabel?: string;
}

export interface SignInWithProviderInput extends PersistlyAuthOptions {
  provider: PersistlyAuthProvider;
  token: string;
}

export type LinkProviderInput = SignInWithProviderInput;

export interface PersistlyAuthSyncPolicy {
  minRemoteSyncIntervalSeconds: number;
  forceSyncCooldownSeconds: number;
  syncOnAppBackground: boolean;
  syncOnAppForeground: boolean;
  syncOnReconnect: boolean;
  maxQueuedLocalSnapshots: number;
}

export interface PersistlyAuthSessionResult {
  accountId: string;
  accountSessionToken: string;
  isNewAccount: boolean;
  linkedProvider: PersistlyAuthProvider;
  wasProviderNewForAccount: boolean;
  syncPolicy?: PersistlyAuthSyncPolicy;
}

export interface PersistlyLinkedProvider {
  provider: PersistlyAuthProvider;
  display?: {
    label?: string;
    emailHint?: string;
  };
  linkedAt?: string;
}
