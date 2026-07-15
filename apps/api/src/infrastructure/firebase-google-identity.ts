import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import {
  GoogleIdentityVerificationError,
  type GoogleIdentityVerifier,
} from "../domain/auth.js";

const APP_NAME = "fauzet-google-auth";

export class FirebaseGoogleIdentityVerifier implements GoogleIdentityVerifier {
  private readonly auth: Auth;

  constructor(projectId: string) {
    const existing = getApps().find(({ name }) => name === APP_NAME);
    const app =
      existing ??
      initializeApp({ credential: applicationDefault(), projectId }, APP_NAME);
    this.auth = getAuth(app);
  }

  async verify(idToken: string) {
    try {
      const decoded = await this.auth.verifyIdToken(idToken, true);
      const provider = decoded.firebase?.sign_in_provider;
      const email = decoded.email?.trim().toLowerCase();
      if (
        provider !== "google.com" ||
        decoded.email_verified !== true ||
        !email ||
        !decoded.sub
      ) {
        throw new GoogleIdentityVerificationError(
          "A verified Google identity is required",
          "invalid_identity",
        );
      }
      const displayName = decoded.name?.trim();
      return {
        subject: decoded.sub,
        email,
        displayName: displayName ? displayName.slice(0, 80) : null,
      };
    } catch (error) {
      if (error instanceof GoogleIdentityVerificationError) throw error;
      const providerCode = firebaseErrorCode(error);
      const reason =
        providerCode === "auth/insufficient-permission" ||
        providerCode === "auth/invalid-credential" ||
        providerCode === "app/invalid-credential"
          ? "provider_configuration"
          : "invalid_token";
      throw new GoogleIdentityVerificationError(
        "Google identity token is invalid or expired",
        reason,
        providerCode,
      );
    }
  }
}

function firebaseErrorCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code.slice(0, 100);
  }
  return undefined;
}
