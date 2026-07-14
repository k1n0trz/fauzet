"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import {
  browserSessionPersistence,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  signInWithPopup,
  signOut,
} from "firebase/auth";

const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

export const googleAuthConfigured = [
  apiKey,
  authDomain,
  projectId,
  appId,
].every((value) => typeof value === "string" && value.length > 0);

function firebaseAuth() {
  if (!googleAuthConfigured) {
    throw new Error("Google Auth todavía no está disponible.");
  }
  const app =
    getApps().length > 0
      ? getApp()
      : initializeApp({
          apiKey: apiKey!,
          authDomain: authDomain!,
          projectId: projectId!,
          appId: appId!,
        });
  return getAuth(app);
}

export async function signInWithGooglePopup() {
  const auth = firebaseAuth();
  await setPersistence(auth, browserSessionPersistence);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const credential = await signInWithPopup(auth, provider);
  return credential.user.getIdToken(true);
}

export async function signOutGoogle() {
  if (!googleAuthConfigured) return;
  await signOut(firebaseAuth());
}
