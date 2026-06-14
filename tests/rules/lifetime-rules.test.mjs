// Firestore security-rules tests for Rumble lifetime cloud sync.
//
// Runs under the Firestore emulator via `npm run test:rules`
// (firebase emulators:exec --only firestore "node --test ...").
//
// Boundary under test: data lives at owners/{ownerId}/tournaments/{id} and
// owners/{ownerId}/players/{phoneKey}, where ownerId is the Firebase Auth uid.
// An owner has full access to their own subtree; everyone else is denied. The
// rules also validate tournament bodies (ownerId stamp, results list <= 64) and
// player doc ids (digits only).
import { before, after, beforeEach, test } from "node:test";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc,
  collection,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
} from "firebase/firestore";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PROJECT_ID = "rumble-d45d9";
const here = dirname(fileURLToPath(import.meta.url));
const rulesPath = join(here, "..", "..", "firestore.rules");

const A = "userA";
const B = "userB";

// A valid tournament body for owner `owner`.
function validTournament(owner, overrides) {
  return Object.assign(
    {
      id: "t1",
      ownerId: owner,
      schemaVersion: 1,
      completedAt: 1000,
      revisedAt: 1000,
      format: "finals",
      courtCount: 3,
      trackedPlayerCount: 1,
      fieldSize: 1,
      results: [
        {
          phoneKey: "5551234567",
          name: "Pat",
          slot: 0,
          status: "active",
          gamesPlayed: 3,
          wins: 2,
          losses: 1,
          pointsFor: 33,
          pointDiff: 5,
          finalRank: 1,
          podium: 1,
          partial: false,
        },
      ],
    },
    overrides
  );
}

function validPlayer(overrides) {
  return Object.assign(
    { phoneKey: "5551234567", displayName: "Pat", lastSeenAt: 1000 },
    overrides
  );
}

// Path helpers, parameterised by the firestore handle of a given auth context.
const tourDoc = (db, owner, id) => doc(db, "owners", owner, "tournaments", id);
const tourCol = (db, owner) => collection(db, "owners", owner, "tournaments");
const playerDoc = (db, owner, key) => doc(db, "owners", owner, "players", key);
const playerCol = (db, owner) => collection(db, "owners", owner, "players");

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(rulesPath, "utf8") },
  });
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

// Seed a doc bypassing rules, so negative read/delete tests exercise the rule on
// an existing doc rather than trivially returning empty.
async function seed(path, data) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, ...path), data);
  });
}

// ----- POSITIVE: owner A has full access to their own subtree --------------

test("owner can create / get / list / update / delete own tournament", async () => {
  const db = testEnv.authenticatedContext(A).firestore();
  await assertSucceeds(setDoc(tourDoc(db, A, "t1"), validTournament(A)));
  await assertSucceeds(getDoc(tourDoc(db, A, "t1")));
  await assertSucceeds(getDocs(tourCol(db, A)));
  await assertSucceeds(
    setDoc(tourDoc(db, A, "t1"), validTournament(A, { revisedAt: 2000 }))
  );
  await assertSucceeds(deleteDoc(tourDoc(db, A, "t1")));
});

test("owner can create / get / list / update / delete own player", async () => {
  const db = testEnv.authenticatedContext(A).firestore();
  await assertSucceeds(setDoc(playerDoc(db, A, "5551234567"), validPlayer()));
  await assertSucceeds(getDoc(playerDoc(db, A, "5551234567")));
  await assertSucceeds(getDocs(playerCol(db, A)));
  await assertSucceeds(
    setDoc(playerDoc(db, A, "5551234567"), validPlayer({ displayName: "Pat B" }))
  );
  await assertSucceeds(deleteDoc(playerDoc(db, A, "5551234567")));
});

// ----- NEGATIVE: user B cannot touch owner A's subtree --------------------

test("other user cannot read/list/write/delete A's tournaments", async () => {
  await seed(["owners", A, "tournaments", "t1"], validTournament(A));
  const db = testEnv.authenticatedContext(B).firestore();
  await assertFails(getDoc(tourDoc(db, A, "t1")));
  await assertFails(getDocs(tourCol(db, A)));
  await assertFails(setDoc(tourDoc(db, A, "t2"), validTournament(A)));
  await assertFails(setDoc(tourDoc(db, A, "t1"), validTournament(A, { revisedAt: 9 })));
  await assertFails(deleteDoc(tourDoc(db, A, "t1")));
});

test("other user cannot read/list/write/delete A's players", async () => {
  await seed(["owners", A, "players", "5551234567"], validPlayer());
  const db = testEnv.authenticatedContext(B).firestore();
  await assertFails(getDoc(playerDoc(db, A, "5551234567")));
  await assertFails(getDocs(playerCol(db, A)));
  await assertFails(setDoc(playerDoc(db, A, "5550000000"), validPlayer({ phoneKey: "5550000000" })));
  await assertFails(setDoc(playerDoc(db, A, "5551234567"), validPlayer({ displayName: "hijack" })));
  await assertFails(deleteDoc(playerDoc(db, A, "5551234567")));
});

// ----- VALIDATION: owner A, but malformed bodies -------------------------

test("tournament with mismatched ownerId is denied", async () => {
  const db = testEnv.authenticatedContext(A).firestore();
  await assertFails(setDoc(tourDoc(db, A, "t1"), validTournament(A, { ownerId: B })));
});

test("tournament with results larger than 64 is denied", async () => {
  const db = testEnv.authenticatedContext(A).firestore();
  const results = Array.from({ length: 65 }, (_, i) => ({
    phoneKey: "555000" + String(i).padStart(4, "0"),
    name: "P" + i,
    slot: i,
    status: "active",
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointDiff: 0,
    finalRank: null,
    podium: null,
    partial: false,
  }));
  await assertFails(setDoc(tourDoc(db, A, "t1"), validTournament(A, { results })));
});

test("tournament with results exactly 64 is allowed", async () => {
  const db = testEnv.authenticatedContext(A).firestore();
  const results = Array.from({ length: 64 }, (_, i) => ({
    phoneKey: "555000" + String(i).padStart(4, "0"),
    name: "P" + i,
    slot: i,
    status: "active",
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointDiff: 0,
    finalRank: null,
    podium: null,
    partial: false,
  }));
  await assertSucceeds(setDoc(tourDoc(db, A, "t1"), validTournament(A, { results })));
});

test("player doc id with non-digits is denied", async () => {
  const db = testEnv.authenticatedContext(A).firestore();
  await assertFails(
    setDoc(playerDoc(db, A, "555-123-4567"), validPlayer({ phoneKey: "555-123-4567" }))
  );
});

// ----- DENY-BY-DEFAULT (catch-all) ---------------------------------------

test("authenticated owner cannot write outside the tournaments/players subtrees", async () => {
  const db = testEnv.authenticatedContext(A).firestore();
  // A sibling collection under the owner's own doc matches no allow rule → catch-all denies.
  await assertFails(setDoc(doc(db, "owners", A, "misc", "x"), { foo: 1 }));
  // A top-level collection is outside both subtrees → catch-all denies.
  await assertFails(setDoc(doc(db, "tournaments", "x"), { foo: 1 }));
});

// ----- UNAUTHENTICATED ---------------------------------------------------

test("unauthenticated access is denied", async () => {
  await seed(["owners", A, "tournaments", "t1"], validTournament(A));
  await seed(["owners", A, "players", "5551234567"], validPlayer());
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(tourDoc(db, A, "t1")));
  await assertFails(getDocs(tourCol(db, A)));
  await assertFails(setDoc(tourDoc(db, A, "t9"), validTournament(A)));
  await assertFails(deleteDoc(tourDoc(db, A, "t1")));
  await assertFails(getDoc(playerDoc(db, A, "5551234567")));
  await assertFails(setDoc(playerDoc(db, A, "5551234567"), validPlayer()));
  await assertFails(deleteDoc(playerDoc(db, A, "5551234567")));
});
