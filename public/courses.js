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
