# ORBIT Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Default-Deny Catch-All**: All paths not explicitly matched in `/databases/{database}/documents` are strictly denied (`allow read, write: if false;`).
2. **Verified Sovereign Operator Identity**: Every read or write to `/orbit_snapshots/{snapshotId}` requires an authenticated user (`request.auth != null`) with `request.auth.token.email_verified == true` and either ownership (`ownerUid == request.auth.uid`) or verified admin identity (`volcanokw@gmail.com` or `/admins/{uid}`).
3. **Path Variable Hardening**: `snapshotId` must match `^[a-zA-Z0-9_\-]+$` and be at most 128 characters.
4. **Anti-Update-Gap & Strict Schema Blueprint**: Both `create` and `update` must pass `isValidOrbitWorkspaceSnapshot(incoming())`, enforcing exact key allowlists (`hasAll` and `hasOnly`), string `.size()` bounds, and server timestamps (`request.time`).
5. **Immutable Ownership & Creation Time**: During `update`, `ownerUid`, `ownerEmail`, and `createdAt` must remain strictly equal to `existing()`.

## 2. The "Dirty Dozen" Payloads (Rejected with PERMISSION_DENIED)
1. **Unauthenticated Write**: `auth = null` attempting `create` on `/orbit_snapshots/primary`.
2. **Unverified Email Spoof**: `auth = { uid: 'u1', token: { email: 'volcanokw@gmail.com', email_verified: false } }`.
3. **Identity Spoofing on Create**: `incoming().ownerUid = 'another-user-uid'` while `request.auth.uid = 'u1'`.
4. **Shadow Field Injection on Create**: Payload includes extra key `isAdmin: true` not in `hasOnly`.
5. **Shadow Field Injection on Update**: Payload modifies `unexpectedField` outside `affectedKeys().hasOnly(...)`.
6. **ID Poisoning**: Document ID exceeds 128 chars or contains `/` or `$` characters.
7. **Denial-of-Wallet Oversized Payload**: `payloadJson.size() > 900000`.
8. **Client-Forged `createdAt` Timestamp**: `incoming().createdAt != request.time` on `create`.
9. **Client-Forged `updatedAt` Timestamp**: `incoming().updatedAt != request.time` on `update`.
10. **Immutable Field Mutation**: Attempting to change `ownerUid` or `createdAt` during `update`.
11. **Value Poisoning on Update**: Updating `fleetCount` with a `string` instead of `int`/`number`.
12. **Blanket List Scraping**: Attempting `list` on `/orbit_snapshots` where `resource.data.ownerUid != request.auth.uid` and caller is not admin.
