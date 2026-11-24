import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
  deleteUser, reauthenticateWithPopup,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc,
  collection, query, where, limit, getDocs, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { normalizeCourse, parseCourseList } from "./courses.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const ALLOWED_DOMAIN = "columbia.edu";
const MAX_RESULTS = 50; // must match the limit in firestore.rules

const $ = (id) => document.getElementById(id);

// ---------- Sign in / out ----------

const provider = new GoogleAuthProvider();
// Only suggests Columbia accounts on Google's screen. It is NOT a security check:
// the real checks are below and in firestore.rules.
provider.setCustomParameters({ hd: ALLOWED_DOMAIN, prompt: "select_account" });

$("sign-in").addEventListener("click", async () => {
  $("sign-in-error").hidden = true;
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    showSignInError(`Sign-in failed: ${err.message}`);
  }
});

$("sign-out").addEventListener("click", () => signOut(auth));

function isColumbiaUser(user) {
  return user && user.emailVerified && user.email.toLowerCase().endsWith("@" + ALLOWED_DOMAIN);
}

function showSignInError(message) {
  $("sign-in-error").textContent = message;
  $("sign-in-error").hidden = false;
}

onAuthStateChanged(auth, async (user) => {
  if (user && !isColumbiaUser(user)) {
    await signOut(auth);
    showSignInError("Please sign in with your @columbia.edu account.");
    return;
  }
  const signedIn = Boolean(user);
  $("signed-out").hidden = signedIn;
  $("signed-in").hidden = !signedIn;
  $("user-bar").hidden = !signedIn;
  if (signedIn) {
    $("user-email").textContent = user.email;
    await loadProfile(user);
  } else {
    $("results").replaceChildren();
    $("results-table").hidden = true;
    $("search-status").textContent = "";
  }
});

// ---------- Your listing ----------

async function loadProfile(user) {
  const snap = await getDoc(doc(db, "profiles", user.uid));
  if (snap.exists()) {
    const p = snap.data();
    $("p-name").value = p.name;
    $("p-contact").value = p.contact;
    $("p-courses").value = p.courses.join(", ");
    $("p-visible").checked = p.visible;
  } else {
    $("profile-form").reset();
    // Left blank on purpose: people choose what name and contact to share.
  }
  $("profile-status").textContent = "";
}

$("profile-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const user = auth.currentUser;
  const { valid, invalid } = parseCourseList($("p-courses").value);
  if (invalid.length) {
    $("profile-status").textContent =
      `Couldn't read: ${invalid.join(", ")}. Use codes like COMS4444.`;
    return;
  }
  if (valid.length > 60) {
    $("profile-status").textContent = "Please list at most 60 courses.";
    return;
  }
  try {
    await setDoc(doc(db, "profiles", user.uid), {
      name: $("p-name").value.trim(),
      contact: $("p-contact").value.trim(),
      courses: valid,
      visible: $("p-visible").checked,
      updatedAt: serverTimestamp(),
    });
    $("p-courses").value = valid.join(", ");
    $("profile-status").textContent = "Saved.";
  } catch (err) {
    $("profile-status").textContent = `Couldn't save: ${err.message}`;
  }
});

$("delete-profile").addEventListener("click", async () => {
  const ok = window.confirm(
    "Delete your listing and your LionCourse account? This removes everything stored about you " +
    "and signs you out. You can sign up again later. This can't be undone.");
  if (!ok) return;
  const user = auth.currentUser;
  try {
    // 1. The listing (name, contact, courses).
    await deleteDoc(doc(db, "profiles", user.uid));
    // 2. The sign-in record (email, account ID) kept by Firebase Authentication.
    try {
      await deleteUser(user);
    } catch (err) {
      // Firebase only allows this shortly after signing in; if it's been a while,
      // ask the person to confirm with Google once more, then retry.
      if (err.code !== "auth/requires-recent-login") throw err;
      await reauthenticateWithPopup(user, provider);
      await deleteUser(user);
    }
    // deleteUser signs the person out, which switches the page to the signed-out view.
    showSignInError("Your listing and account were deleted.");
  } catch (err) {
    $("profile-status").textContent = `Couldn't finish deleting: ${err.message}`;
  }
});

// ---------- Search ----------

$("search-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = normalizeCourse($("search-input").value);
  const results = $("results");
  results.replaceChildren();
  $("results-table").hidden = true;
  if (!code) {
    $("search-status").textContent = "Enter a course code like COMS4444.";
    return;
  }
  $("search-status").textContent = "Searching...";
  try {
    const q = query(
      collection(db, "profiles"),
      where("visible", "==", true),
      where("courses", "array-contains", code),
      limit(MAX_RESULTS),
    );
    const snap = await getDocs(q);
    const people = snap.docs.map((d) => d.data())
      .sort((a, b) => a.name.localeCompare(b.name));
    $("search-status").textContent = people.length
      ? `${people.length} student${people.length === 1 ? "" : "s"} listed for ${code}:`
      : `No one has listed ${code} yet.`;
    for (const p of people) {
      // textContent (not innerHTML) so nobody can inject code through their name.
      const tr = document.createElement("tr");
      for (const value of [p.name, p.contact]) {
        const td = document.createElement("td");
        td.textContent = value;
        tr.append(td);
      }
      results.append(tr);
    }
    $("results-table").hidden = people.length === 0;
  } catch (err) {
    $("search-status").textContent = `Search failed: ${err.message}`;
  }
});
