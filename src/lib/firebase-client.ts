import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";

function getFirebaseConfig() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

  if (!apiKey || !authDomain || !projectId || !appId) return null;
  return { apiKey, authDomain, projectId, appId };
}

export function isFirebasePhoneAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FIREBASE_PHONE_AUTH_ENABLED === "1";
}

export function getFirebaseApp() {
  const cfg = getFirebaseConfig();
  if (!cfg) return null;
  return getApps().length ? getApps()[0]! : initializeApp(cfg);
}

export function getFirebaseAuth() {
  const app = getFirebaseApp();
  if (!app) return null;
  return getAuth(app);
}

