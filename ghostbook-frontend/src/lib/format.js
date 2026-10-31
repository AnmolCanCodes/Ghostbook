/* Date parsing, relative time, and small shared formatting helpers. */

export const LOGIN_METHODS = [
  { value: "google", label: "Google" },
  { value: "apple", label: "Apple" },
  { value: "facebook", label: "Facebook" },
  { value: "github", label: "GitHub" },
  { value: "email_password", label: "Email + password" },
  { value: "phone_otp", label: "Phone OTP" },
  { value: "other", label: "Other" },
];

const METHOD_LABELS = Object.fromEntries(LOGIN_METHODS.map((m) => [m.value, m.label]));

export function loginMethodLabel(value) {
  return METHOD_LABELS[value] ?? "Other";
}

const DAY_MS = 86400000;

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Parse YYYY-MM-DD as a local date (no UTC shift) or any other ISO string. */
export function parseDate(value) {
  if (!value || typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    const [, y, m, d] = match.map(Number);
    const date = new Date(y, m - 1, d);
    return date.getMonth() === m - 1 && date.getDate() === d ? date : null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Whole days between a date string and now. Null when unparseable. */
export function daysSince(value, now = new Date()) {
  const date = parseDate(value);
  if (!date) return null;
  return Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
}

export function plural(count, one, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

/** "today", "yesterday", "9 days ago", "14 months ago". Null when unknown. */
export function relativeTime(value, now = new Date()) {
  const days = daysSince(value, now);
  if (days === null) return null;
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 730) return `${Math.floor(days / 30.44)} months ago`;
  return `${Math.floor(days / 365.25)} years ago`;
}

const exactFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatExactDate(value) {
  const date = parseDate(value);
  return date ? exactFormat.format(date) : "";
}

/** Value for <input type="date">. Empty string when unknown. */
export function toDateInputValue(value) {
  const date = parseDate(value);
  if (!date) return "";
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

/** 872 seconds becomes "14:32". */
export function formatCountdown(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = String(safe % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function normalizeSite(site) {
  return typeof site === "string" ? site.trim().toLowerCase() : "";
}

/** Returns the href when value is a plain http or https URL, else null. */
export function safeHttpUrl(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}