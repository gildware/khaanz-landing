import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ADMIN_APP_NAME = "khaanz-admin";

type ServiceAccountCreds = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function hasEnvServiceAccount(): boolean {
  return Boolean(
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim() &&
      process.env.FIREBASE_ADMIN_PRIVATE_KEY?.trim(),
  );
}

function loadServiceAccountFromEnv(): ServiceAccountCreds {
  const projectId = required(
    "FIREBASE_ADMIN_PROJECT_ID",
    process.env.FIREBASE_ADMIN_PROJECT_ID,
  );
  const clientEmail = required(
    "FIREBASE_ADMIN_CLIENT_EMAIL",
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  );
  const privateKey = required(
    "FIREBASE_ADMIN_PRIVATE_KEY",
    process.env.FIREBASE_ADMIN_PRIVATE_KEY,
  ).replace(/\\n/g, "\n");

  return { projectId, clientEmail, privateKey };
}

function loadServiceAccountFromFile(credsPath: string): ServiceAccountCreds {
  const resolvedPath = path.isAbsolute(credsPath)
    ? credsPath
    : path.resolve(process.cwd(), credsPath);
  const raw = readFileSync(resolvedPath, "utf8");
  const j = JSON.parse(raw) as {
    project_id?: string;
    client_email?: string;
    private_key?: string;
  };

  const projectId = required("service_account.project_id", j.project_id);
  const clientEmail = required("service_account.client_email", j.client_email);
  const privateKey = required("service_account.private_key", j.private_key);

  return { projectId, clientEmail, privateKey };
}

function loadServiceAccount(): ServiceAccountCreds {
  const credsPath = process.env.FIREBASE_ADMIN_CREDENTIALS_PATH?.trim();

  if (credsPath) {
    const resolvedPath = path.isAbsolute(credsPath)
      ? credsPath
      : path.resolve(process.cwd(), credsPath);
    if (existsSync(resolvedPath)) {
      return loadServiceAccountFromFile(resolvedPath);
    }
    if (hasEnvServiceAccount()) {
      console.warn(
        `[firebase-admin] Credentials file not found at ${resolvedPath}; using FIREBASE_ADMIN_* env vars.`,
      );
      return loadServiceAccountFromEnv();
    }
    throw new Error(`Firebase admin credentials file not found: ${resolvedPath}`);
  }

  return loadServiceAccountFromEnv();
}

function assertProjectMatchesClient(projectId: string): void {
  const clientProject = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  if (clientProject && clientProject !== projectId) {
    throw new Error(
      `Firebase admin project "${projectId}" does not match NEXT_PUBLIC_FIREBASE_PROJECT_ID "${clientProject}".`,
    );
  }
}

export function getFirebaseAdminApp(): App {
  const existing = getApps().find((app) => app.name === ADMIN_APP_NAME);
  if (existing) return existing;

  const { projectId, clientEmail, privateKey } = loadServiceAccount();
  assertProjectMatchesClient(projectId);

  return initializeApp(
    {
      credential: cert({ projectId, clientEmail, privateKey }),
      projectId,
    },
    ADMIN_APP_NAME,
  );
}

export function getFirebaseAdminAuth() {
  return getAdminAuth(getFirebaseAdminApp());
}

