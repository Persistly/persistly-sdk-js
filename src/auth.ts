export type PersistlyAccountMode = "anonymousFirst" | "authRequired";

export type PersistlyAuthProvider = "google" | "oidc_jwt";

export interface PersistlyAuthOptions {
  deviceLabel?: string;
}

export interface SignInWithProviderInput extends PersistlyAuthOptions {
  provider: PersistlyAuthProvider;
  token: string;
}

export type LinkProviderInput = SignInWithProviderInput;

export interface PersistlyAuthSessionResult {
  accountId: string;
  accountSessionToken: string;
  isNewAccount: boolean;
  linkedProvider: PersistlyAuthProvider;
  wasProviderNewForAccount: boolean;
}

export interface PersistlyLinkedProvider {
  provider: PersistlyAuthProvider;
  display?: {
    label?: string;
    emailHint?: string;
  };
  linkedAt?: string;
}
