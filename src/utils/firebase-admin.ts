// src/utils/firebase-admin.ts
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getDatabase, type Database } from 'firebase-admin/database';

export const FIREBASE_DATABASE_URL = 'https://dandy-562fc-default-rtdb.europe-west1.firebasedatabase.app';

export function getAdminApp(): App {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const saEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!saEnv) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is missing');
  }

  const serviceAccount = typeof saEnv === 'string' ? JSON.parse(saEnv) : { ...saEnv };
  if (
    serviceAccount &&
    typeof serviceAccount.private_key === 'string' &&
    serviceAccount.private_key.includes('\\n')
  ) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }

  return initializeApp({
    credential: cert(serviceAccount),
    databaseURL: FIREBASE_DATABASE_URL
  });
}

export function getAdminDb(): Database {
  return getDatabase(getAdminApp());
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}
