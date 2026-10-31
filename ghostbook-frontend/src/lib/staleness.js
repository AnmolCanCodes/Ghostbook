/* Ghost levels: how long since an account was last used. */

import { relativeTime } from "./format.js";
import { daysSince } from "./format.js";

/** Mirrors the backend default STALE_ACCOUNT_DAYS. */
export const GHOST_DAYS = 180;
const AGING_DAYS = GHOST_DAYS / 2;

/** One of "fresh", "aging", "ghost", "unknown". */
export function ghostLevel(lastUsed, now = new Date()) {
  const days = daysSince(lastUsed, now);
  if (days === null) return "unknown";
  if (days > GHOST_DAYS) return "ghost";
  if (days > AGING_DAYS) return "aging";
  return "fresh";
}

export function isGhost(account, now = new Date()) {
  return ghostLevel(account.last_used, now) === "ghost";
}

export function countGhosts(accounts, now = new Date()) {
  return accounts.filter((account) => isGhost(account, now)).length;
}

/** The italic margin note for a card. Null when there is nothing to say. */
export function ghostNote(level, lastUsed, now = new Date()) {
  const when = relativeTime(lastUsed, now);
  if (level === "unknown") return "No record of when you last visited.";
  if (level === "ghost") return `Last seen ${when}. Probably still holds your data.`;
  if (level === "aging") return `Last seen ${when}. Not a ghost yet.`;
  return null;
}