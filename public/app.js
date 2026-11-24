import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc,
  collection, query, where, limit, getDocs, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { normalizeCourse, termOptions, termSortKey } from "./courses.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const ALLOWED_DOMAIN = "columbia.edu";
const MAX_RESULTS = 50; // must match the limit in firestore.rules
const MAX_COURSES = 60;  // must match the limit in firestore.rules
const TERMS = termOptions();

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

// One row per course: code, semester (optional), professor (optional).
function addCourseRow({ code = "", term = "", professor = "" } = {}) {
  const row = document.createElement("div");
  row.className = "course-row";

  const codeInput = document.createElement("input");
  codeInput.className = "code";
  codeInput.placeholder = "COMS4444";
  codeInput.maxLength = 20;
  codeInput.setAttribute("aria-label", "Course code");
  codeInput.value = code;

  const termSelect = document.createElement("select");
  termSelect.className = "term";
  termSelect.setAttribute("aria-label", "Semester taken");
  const choices = ["", ...TERMS];
  // Keep an older saved semester selectable even after it scrolls off the menu.
  if (term && !TERMS.includes(term)) choices.push(term);
  for (const t of choices) {
    const option = document.createElement("option");
    option.value = t;
    option.textContent = t || "Semester?";
    termSelect.append(option);
  }
  termSelect.value = term;

  const profInput = document.createElement("input");
  profInput.className = "prof";
  profInput.placeholder = "Professor";
  profInput.maxLength = 80;
  profInput.setAttribute("aria-label", "Professor");
  profInput.value = professor;

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "link";
  remove.textContent = "Remove";
  remove.addEventListener("click", () => {
    row.remove();
    if (!$("course-rows").children.length) addCourseRow();
  });

  row.append(codeInput, termSelect, profInput, remove);
  $("course-rows").append(row);
  return row;
}

$("add-course").addEventListener("click", () => {
  addCourseRow().querySelector(".code").focus();
});

// Reads the course rows. Returns { courses, details, errors }.
function readCourseRows() {
  const courses = [];
  const details = {};
  const errors = [];
  for (const row of $("course-rows").children) {
    const raw = row.querySelector(".code").value.trim();
    const term = row.querySelector(".term").value;
    const professor = row.querySelector(".prof").value.trim();
    if (!raw && !term && !professor) continue; // empty row
    const code = normalizeCourse(raw);
    if (!code) { errors.push(raw ? `"${raw}" isn't a course code` : "a row is missing its course code"); continue; }
    if (details[code]) { errors.push(`${code} is listed twice`); continue; }
    courses.push(code);
    details[code] = {};
    if (term) details[code].term = term;
    if (professor) details[code].professor = professor;
  }
  return { courses, details, errors };
}

async function loadProfile(user) {
  const snap = await getDoc(doc(db, "profiles", user.uid));
  $("course-rows").replaceChildren();
  if (snap.exists()) {
    const p = snap.data();
    $("p-name").value = p.name;
    $("p-contact").value = p.contact;
    $("p-visible").checked = p.visible;
    for (const code of p.courses) addCourseRow({ code, ...(p.details?.[code] || {}) });
  } else {
    // Left blank on purpose: people choose what name and contact to share.
    $("profile-form").reset();
  }
  if (!$("course-rows").children.length) addCourseRow();
  $("profile-status").textContent = "";
}

$("profile-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const user = auth.currentUser;
  const { courses, details, errors } = readCourseRows();
  if (errors.length) {
    $("profile-status").textContent = `Please fix: ${errors.join("; ")}. Codes look like COMS4444.`;
    return;
  }
  if (courses.length > MAX_COURSES) {
    $("profile-status").textContent = `Please list at most ${MAX_COURSES} courses.`;
    return;
  }
  try {
    await setDoc(doc(db, "profiles", user.uid), {
      name: $("p-name").value.trim(),
      contact: $("p-contact").value.trim(),
      courses,
      details,
      visible: $("p-visible").checked,
      updatedAt: serverTimestamp(),
    });
    // Show the cleaned-up codes, e.g. "coms w4444" becomes "COMS4444".
    $("course-rows").replaceChildren();
    for (const code of courses) addCourseRow({ code, ...details[code] });
    if (!courses.length) addCourseRow();
    $("profile-status").textContent = "Saved.";
  } catch (err) {
    $("profile-status").textContent = `Couldn't save: ${err.message}`;
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
    // Attach this course's semester and professor; most recent semester first.
    const people = snap.docs.map((d) => {
      const p = d.data();
      const info = p.details?.[code] || {};
      return { name: p.name, contact: p.contact, term: info.term, professor: info.professor };
    }).sort((a, b) => termSortKey(b.term) - termSortKey(a.term) || a.name.localeCompare(b.name));
    $("search-status").textContent = people.length
      ? `${people.length} student${people.length === 1 ? "" : "s"} listed for ${code}:`
      : `No one has listed ${code} yet.`;
    for (const p of people) {
      // textContent (not innerHTML) so nobody can inject code through what they type.
      const tr = document.createElement("tr");
      for (const value of [p.name, p.contact, p.term || "", p.professor || ""]) {
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
