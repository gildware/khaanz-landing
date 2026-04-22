import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { readFileSync } from "node:fs";

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

export function getFirebaseAdminApp(): App {
  if (getApps().length) return getApps()[0]!;

  // Prefer env vars, but allow local JSON file for dev convenience.
  const credsPath = process.env.FIREBASE_ADMIN_CREDENTIALS_PATH;
  if (credsPath) {
    const raw = readFileSync(credsPath, "utf8");
    const j = JSON.parse(raw) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };

    const projectId = required("service_account.project_id", j.project_id);
    const clientEmail = required("service_account.client_email", j.client_email);
    const privateKey = required("service_account.private_key", j.private_key);

    return initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
  }

  const projectId = required("FIREBASE_ADMIN_PROJECT_ID", process.env.FIREBASE_ADMIN_PROJECT_ID);
  const clientEmail = required(
    "FIREBASE_ADMIN_CLIENT_EMAIL",
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  );
  const privateKey = required("FIREBASE_ADMIN_PRIVATE_KEY", process.env.FIREBASE_ADMIN_PRIVATE_KEY)
    .replace(/\\n/g, "\n");

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

export function getFirebaseAdminAuth() {
  return getAdminAuth(getFirebaseAdminApp());
}

