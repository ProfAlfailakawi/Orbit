import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection to Firestore on boot (Fail-open for offline/unauthenticated boot)
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogleOperator(): Promise<User> {
  const credential = await signInWithPopup(auth, googleProvider);
  return credential.user;
}

export async function signOutGoogleOperator(): Promise<void> {
  await signOut(auth);
}

export function observeOperatorAuth(callback: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, callback);
}

function getSnapshotDocId(uid: string): string {
  return `orbit_${uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 96)}`;
}

export async function syncStateToFirestore(snapshotPayload: {
  fleetCount: number;
  data: Record<string, unknown>;
}): Promise<{ syncedAt: string; docId: string } | null> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return null;

  const docId = getSnapshotDocId(user.uid);
  const path = `orbit_snapshots/${docId}`;
  const docRef = doc(db, 'orbit_snapshots', docId);

  const serialized = JSON.stringify(snapshotPayload.data);
  if (serialized.length > 890000) {
    throw new Error('حجم النسخة السحابية أكبر من الحد المسموح. لم تُحفظ نسخة ناقصة.');
  }
  const safeFleetCount = Math.max(0, Math.min(500, Math.floor(snapshotPayload.fleetCount)));

  try {
    const existingSnap = await getDoc(docRef);
    if (!existingSnap.exists()) {
      await setDoc(docRef, {
        ownerUid: user.uid,
        ownerEmail: (user.email || '').slice(0, 254),
        workspaceName: 'ORBIT Sovereign Fleet Workspace',
        fleetCount: safeFleetCount,
        payloadJson: serialized,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(docRef, {
        workspaceName: 'ORBIT Sovereign Fleet Workspace',
        fleetCount: safeFleetCount,
        payloadJson: serialized,
        updatedAt: serverTimestamp(),
      });
    }
    return { syncedAt: new Date().toISOString(), docId };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeToCloudSnapshot(
  uid: string,
  onData: (parsed: Record<string, unknown>, updatedAtIso: string) => void
): Unsubscribe {
  const docId = getSnapshotDocId(uid);
  const path = `orbit_snapshots/${docId}`;
  const docRef = doc(db, 'orbit_snapshots', docId);

  return onSnapshot(
    docRef,
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (typeof data?.payloadJson === 'string') {
        try {
          const parsed = JSON.parse(data.payloadJson) as Record<string, unknown>;
          onData(parsed, new Date().toISOString());
        } catch {
          // Ignore malformed snapshot
        }
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}
