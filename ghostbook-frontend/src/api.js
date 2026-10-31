/*
 * Fetch wrapper for the Ghostbook backend.
 * The session token lives only in this module's memory. It is never persisted,
 * and nothing in here logs tokens, passphrases, or request and response bodies.
 */

const BASE = "/api";

const BACKEND_DOWN =
  "Cannot reach the Ghostbook backend. From the backend folder, start it with: uvicorn app.main:app --reload --port 8000";

let token = null;
let lockHandler = null;
let activityHandler = null;

export class ApiError extends Error {
  constructor(status, code, detail, extra = {}) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.extra = extra;
  }
}

export function setToken(value) {
  token = value;
}

export function clearToken() {
  token = null;
}

export function registerLockHandler(fn) {
  lockHandler = fn;
}

export function registerActivityHandler(fn) {
  activityHandler = fn;
}

/** Turn FastAPI's default validation array into { field: message }. */
function fieldErrorsFrom(detail) {
  const fields = {};
  for (const item of detail) {
    if (!item || !Array.isArray(item.loc)) continue;
    const name = item.loc[item.loc.length - 1];
    if (typeof name === "string" && !(name in fields)) {
      fields[name] = typeof item.msg === "string" ? item.msg : "Invalid value.";
    }
  }
  return fields;
}

async function readError(res) {
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  const body = payload && typeof payload === "object" ? payload : {};
  const { detail, code, ...extra } = body;

  if (Array.isArray(detail)) {
    return new ApiError(res.status, "validation_error", "Some fields need attention.", {
      ...extra,
      fieldErrors: fieldErrorsFrom(detail),
    });
  }
  if (typeof code !== "string" && res.status >= 500) {
    return new ApiError(res.status, "network_error", BACKEND_DOWN, extra);
  }
  return new ApiError(
    res.status,
    typeof code === "string" ? code : "http_error",
    typeof detail === "string" ? detail : "Something went wrong.",
    extra
  );
}

async function request(method, path, { body, signal, auth = true, track = auth } = {}) {
  const headers = { Accept: "application/json" };
  const hasBody = body !== undefined;
  if (hasBody) headers["Content-Type"] = "application/json";
  const sentToken = auth ? token : null;
  if (sentToken) headers.Authorization = `Bearer ${sentToken}`;

  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: hasBody ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err && err.name === "AbortError") throw err;
    throw new ApiError(0, "network_error", BACKEND_DOWN);
  }

  if (!res.ok) {
    const error = await readError(res);
    if (error.status === 401 && error.code === "vault_locked") {
      clearToken();
      if (lockHandler) lockHandler();
    }
    throw error;
  }

  if (track && sentToken && activityHandler) activityHandler();
  if (res.status === 204) return null;
  return res.json();
}

const MESSAGES = {
  ai_disabled: "AI is turned off in this setup. The ledger still works fully.",
  ai_not_configured: "AI is selected but no key or model is configured. Check your .env.",
  ai_unavailable: "The model did not answer. Try again, or switch LLM_MODE.",
  ai_bad_output: "The model replied with something unusable. Try again.",
};

/** One literal, helpful sentence for any error. */
export function describeError(err) {
  if (err instanceof ApiError) {
    if (err.code === "network_error") return err.detail;
    return MESSAGES[err.code] ?? err.detail;
  }
  return "Something went wrong.";
}

export const getStatus = () => request("GET", "/auth/status", { auth: false });

export const setup = (passphrase) =>
  request("POST", "/auth/setup", { body: { passphrase }, auth: false });

export const unlock = (passphrase) =>
  request("POST", "/auth/unlock", { body: { passphrase }, auth: false });

export const lock = () => request("POST", "/auth/lock", { track: false });

export const listAccounts = (q, signal) => {
  const query = q && q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  return request("GET", `/accounts${query}`, { signal });
};

export const createAccount = (account) => request("POST", "/accounts", { body: account });

export const updateAccount = (id, account) =>
  request("PUT", `/accounts/${id}`, { body: account });

export const deleteAccount = (id) => request("DELETE", `/accounts/${id}`);

export const parseText = (text) => request("POST", "/ai/parse", { body: { text } });

export const askQuestion = (question) => request("POST", "/ai/ask", { body: { question } });

export const getHaunting = () => request("GET", "/haunting");