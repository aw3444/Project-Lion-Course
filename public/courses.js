// Turns what a student types into a clean, consistent course code,
// so "coms 4444", "COMS W4444" and "COMS4444" all match each other.
//
// Columbia codes are a 4-letter department, an optional 1–2 letter
// prefix (W, BC, GU, ...), and a 4-digit number. We drop the prefix,
// since students rarely agree on whether to include it.
const COURSE_PATTERN = /^([A-Z]{4})[A-Z]{0,2}(\d{4})$/;

export function normalizeCourse(raw) {
  const compact = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const match = compact.match(COURSE_PATTERN);
  return match ? match[1] + match[2] : null;
}

// Splits a list like "COMS4444, ieor 3700\nMUSI3333" into clean codes.
// Returns { valid: [...unique codes], invalid: [...entries that didn't parse] }.
export function parseCourseList(text) {
  const valid = new Set();
  const invalid = [];
  for (const entry of String(text).split(/[,;\n]+/)) {
    if (!entry.trim()) continue;
    const code = normalizeCourse(entry);
    if (code) valid.add(code);
    else invalid.push(entry.trim());
  }
  return { valid: [...valid], invalid };
}

// ---------- Semesters ----------
// Stored as plain text like "Fall 2026" so it reads naturally everywhere.

const SEASONS = ["Spring", "Summer", "Fall"]; // calendar order within a year

// The semester a date falls in: Jan–May Spring, Jun–Aug Summer, Sep–Dec Fall.
function currentTerm(now) {
  const m = now.getMonth(); // 0 = January
  const season = m <= 4 ? "Spring" : m <= 7 ? "Summer" : "Fall";
  return { season, year: now.getFullYear() };
}

// Choices for the semester menu, newest first: the current semester back `years` years.
export function termOptions(now = new Date(), years = 8) {
  const { season, year } = currentTerm(now);
  const options = [];
  for (let y = year; y > year - years; y--) {
    for (const s of [...SEASONS].reverse()) {
      if (y === year && SEASONS.indexOf(s) > SEASONS.indexOf(season)) continue;
      options.push(`${s} ${y}`);
    }
  }
  return options;
}

// Number for sorting: bigger = more recent. Missing or unreadable terms sort last.
export function termSortKey(term) {
  const match = /^(Spring|Summer|Fall) (\d{4})$/.exec(term || "");
  return match ? Number(match[2]) * 3 + SEASONS.indexOf(match[1]) : -1;
}

// ---------- Professor names ----------
// Stored as "First Last" so the same person is written the same way.
//   "prof. john smith"  -> "John Smith"
//   "Dr. Ana de la Cruz" -> "Ana de la Cruz" (if any capitals were typed, they are kept as is)
//   "Smith"             -> null (needs a first and last name)
// Returns "" for an empty entry, the cleaned name, or null if it can't be used.
const TITLES = /^(prof(essor)?|dr|mr|mrs|ms|mx)\.?\s+/i;
const NAME_WORD = /^[\p{L}][\p{L}'’.-]*$/u;

export function normalizeProfessor(raw) {
  let name = String(raw).trim().replace(/\s+/g, " ");
  while (TITLES.test(name)) name = name.replace(TITLES, "");
  if (!name) return "";
  if (name.includes(",")) return null; // "Smith, John": ask for First Last instead
  const words = name.split(" ");
  if (words.length < 2 || !words.every((w) => NAME_WORD.test(w))) return null;
  // If the whole name was typed in lowercase, capitalize each word.
  // Otherwise keep the person's own capitals (McDonald, de la Cruz).
  if (name !== name.toLowerCase()) return words.join(" ");
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}
