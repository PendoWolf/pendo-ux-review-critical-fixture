// API base URL. Defaults to the local server; override via VITE_API_URL for
// deployed/preview environments (QAWolf runs against whatever URL this points at).
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export interface AppState {
  counter: number;
  lastAction: string;
}

async function call(path: string, method: "GET" | "POST"): Promise<AppState> {
  const res = await fetch(`${BASE}${path}`, { method });
  if (!res.ok) {
    // Attach the status so callers can report it without parsing the message.
    throw Object.assign(new Error(`${method} ${path} failed: ${res.status}`), { status: res.status });
  }
  return res.json() as Promise<AppState>;
}

export const api = {
  getState: () => call("/api/state", "GET"),
  increment: () => call("/api/increment", "POST"),
  decrement: () => call("/api/decrement", "POST"),
  reset: () => call("/api/reset", "POST"),
};
