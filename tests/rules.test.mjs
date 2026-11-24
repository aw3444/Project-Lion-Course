// Checks that firestore.rules keeps the directory private.
// Run with: npm test   (starts a local copy of the database; nothing touches the real one)
import { readFileSync } from "node:fs";
import { test, before, after, beforeEach } from "node:test";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import {
  doc, getDoc, setDoc, deleteDoc, collection, query, where, limit, getDocs,
  serverTimestamp,
} from "firebase/firestore";

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "lioncourse-test",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});
after(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const columbia = (uid) =>
  env.authenticatedContext(uid, { email: `${uid}@columbia.edu`, email_verified: true }).firestore();
const outsider = () =>
  env.authenticatedContext("eve", { email: "eve@gmail.com", email_verified: true }).firestore();
const fakeColumbia = () =>
  env.authenticatedContext("mallory", { email: "mallory@columbia.edu.evil.com", email_verified: true }).firestore();
const anonymous = () => env.unauthenticatedContext().firestore();

const profile = (overrides = {}) => ({
  name: "Alice Brown",
  contact: "ab1234@columbia.edu",
  courses: ["COMS4444"],
  visible: true,
  updatedAt: serverTimestamp(),
  ...overrides,
});

async function seed(uid, data) {
  await env.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), "profiles", uid), { ...data, updatedAt: new Date() }));
}

const search = (db, code, n = 50) =>
  getDocs(query(collection(db, "profiles"),
    where("visible", "==", true), where("courses", "array-contains", code), limit(n)));

// ----- Who can see the directory -----

test("Columbia student can search", async () => {
  await seed("alice", profile());
  await assertSucceeds(search(columbia("bob"), "COMS4444"));
});

test("not signed in: cannot search", async () => {
  await assertFails(search(anonymous(), "COMS4444"));
});

test("non-Columbia Google account: cannot search", async () => {
  await assertFails(search(outsider(), "COMS4444"));
});

test("look-alike domain (columbia.edu.evil.com): cannot search", async () => {
  await assertFails(search(fakeColumbia(), "COMS4444"));
});

test("unverified Columbia email: cannot search", async () => {
  const db = env.authenticatedContext("x", { email: "x@columbia.edu", email_verified: false }).firestore();
  await assertFails(search(db, "COMS4444"));
});

// ----- Copying the whole directory -----

test("cannot list everyone without a limit", async () => {
  await assertFails(getDocs(query(collection(columbia("bob"), "profiles"), where("visible", "==", true))));
});

test("cannot ask for more than 50 at once", async () => {
  await assertFails(search(columbia("bob"), "COMS4444", 51));
});

test("search must exclude hidden profiles", async () => {
  await assertFails(getDocs(query(collection(columbia("bob"), "profiles"),
    where("courses", "array-contains", "COMS4444"), limit(50))));
});

// ----- Hidden profiles -----

test("hidden profile: others cannot read it", async () => {
  await seed("alice", profile({ visible: false }));
  await assertFails(getDoc(doc(columbia("bob"), "profiles", "alice")));
});

test("hidden profile: owner can still read it", async () => {
  await seed("alice", profile({ visible: false }));
  await assertSucceeds(getDoc(doc(columbia("alice"), "profiles", "alice")));
});

// ----- Editing -----

test("can create and delete your own profile", async () => {
  const db = columbia("alice");
  await assertSucceeds(setDoc(doc(db, "profiles", "alice"), profile()));
  await assertSucceeds(deleteDoc(doc(db, "profiles", "alice")));
});

test("cannot write someone else's profile", async () => {
  await assertFails(setDoc(doc(columbia("bob"), "profiles", "alice"), profile()));
});

test("cannot delete someone else's profile", async () => {
  await seed("alice", profile());
  await assertFails(deleteDoc(doc(columbia("bob"), "profiles", "alice")));
});

test("outsider cannot create a profile", async () => {
  await assertFails(setDoc(doc(outsider(), "profiles", "eve"), profile()));
});

test("cannot add unexpected fields", async () => {
  await assertFails(setDoc(doc(columbia("alice"), "profiles", "alice"), profile({ isAdmin: true })));
});

test("cannot save an empty name or a huge contact field", async () => {
  const db = columbia("alice");
  await assertFails(setDoc(doc(db, "profiles", "alice"), profile({ name: "" })));
  await assertFails(setDoc(doc(db, "profiles", "alice"), profile({ contact: "x".repeat(201) })));
});
