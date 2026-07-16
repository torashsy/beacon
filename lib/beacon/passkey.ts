import type { SupabaseClient } from "@supabase/supabase-js";

type JsonCredentialDescriptor = {
  id: string;
  type?: PublicKeyCredentialType;
  transports?: AuthenticatorTransport[];
};

type JsonCreationOptions = Omit<
  PublicKeyCredentialCreationOptions,
  "challenge" | "user" | "excludeCredentials"
> & {
  challenge: string;
  user: Omit<PublicKeyCredentialUserEntity, "id"> & { id: string };
  excludeCredentials?: JsonCredentialDescriptor[];
};

function fromBase64Url(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function toBase64Url(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Supabaseが返すWebAuthnオプションのユーザー表示だけを公開IDへ差し替える。
 * user.id・challenge・RP情報は変更しないため、認証上の紐付けはサーバー値を維持する。
 */
export function passkeyCreationOptions(
  options: JsonCreationOptions,
  handle: string,
): PublicKeyCredentialCreationOptions {
  const accountLabel = `@${handle}`;
  const { challenge, user, excludeCredentials, ...rest } = options;
  return {
    ...rest,
    challenge: fromBase64Url(challenge),
    user: {
      ...user,
      id: fromBase64Url(user.id),
      name: accountLabel,
      displayName: accountLabel,
    },
    excludeCredentials: excludeCredentials?.map((credential) => ({
      ...credential,
      id: fromBase64Url(credential.id),
      type: credential.type ?? "public-key",
    })),
  };
}

function serializeRegistrationCredential(credential: PublicKeyCredential) {
  const response = credential.response as AuthenticatorAttestationResponse;
  const withAttachment = credential as PublicKeyCredential & {
    authenticatorAttachment?: AuthenticatorAttachment | null;
  };
  return {
    id: credential.id,
    rawId: credential.id,
    response: {
      attestationObject: toBase64Url(response.attestationObject),
      clientDataJSON: toBase64Url(response.clientDataJSON),
    },
    type: "public-key" as const,
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: withAttachment.authenticatorAttachment ?? undefined,
  };
}

/** OSの保存画面に内部メールではなく公開IDだけを表示してパスキーを登録する。 */
export async function registerPasskeyForHandle(db: SupabaseClient, handle: string): Promise<void> {
  if (!("PublicKeyCredential" in window) || !navigator.credentials?.create) {
    throw new Error("passkey not supported");
  }
  const started = await db.auth.passkey.startRegistration();
  if (started.error || !started.data) throw started.error ?? new Error("passkey registration failed");

  const credential = await navigator.credentials.create({
    publicKey: passkeyCreationOptions(started.data.options as unknown as JsonCreationOptions, handle),
  });
  if (!(credential instanceof PublicKeyCredential)) throw new Error("passkey registration cancelled");

  const verified = await db.auth.passkey.verifyRegistration({
    challengeId: started.data.challenge_id,
    credential: serializeRegistrationCredential(credential),
  });
  if (verified.error) throw verified.error;
}
