import { useEffect, useRef, useState } from "react";
import { api, ApiError, type AppState } from "./api";

type Action = "load" | "refresh" | "increment" | "decrement" | "reset";
type TrackProps = Record<string, string | number | boolean>;

// Seam for Pendo. Novus installs the Pendo agent, which provides window.pendo
// at runtime; this fires a Track Event for each action. No-op when the agent
// isn't present (local dev), so the app and Playwright mocks both stay simple.
function trackEvent(name: string, props: TrackProps) {
  if (typeof window !== "undefined") {
    try {
      window.pendo?.track?.(name, props);
    } catch {
      // Analytics must never break the app or be reported as a failed action.
    }
  }
}

// Fires the Track Event for an action whose request succeeded. `previous` is the
// state the UI showed before the response; `next` is what the API returned.
// Event names must match the track types registered in Pendo exactly, so they
// are spelled out rather than built from the action name.
function trackSuccess(action: Action, previous: AppState, next: AppState) {
  switch (action) {
    case "load":
      trackEvent("demo-load", { counter: next.counter, lastAction: next.lastAction });
      break;
    case "refresh":
      trackEvent("demo-refresh", {
        counter: next.counter,
        previousCounter: previous.counter,
        counterChanged: next.counter !== previous.counter,
        lastAction: next.lastAction,
      });
      break;
    case "increment":
      trackEvent("demo-increment", { counter: next.counter, previousCounter: previous.counter });
      break;
    case "decrement":
      trackEvent("demo-decrement", { counter: next.counter, previousCounter: previous.counter });
      break;
    case "reset":
      // The counter is always 0 after a reset, so record what was cleared instead.
      trackEvent("demo-reset", {
        previousCounter: previous.counter,
        previousLastAction: previous.lastAction,
      });
      break;
  }
}

// Fires one event for any failed request, with the action that failed.
function trackFailure(action: Action, e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  trackEvent("demo-action-failed", {
    action,
    // Truncated to stay well inside Pendo's 512-byte limit on event properties.
    errorMessage: message.slice(0, 100),
    // Only non-2xx responses carry a status, so a missing httpStatus means no
    // HTTP error came back (typically a network or CORS failure).
    ...(e instanceof ApiError ? { httpStatus: e.status } : {}),
  });
}

// React StrictMode runs the mount effect twice in development. Only the first
// run tracks the initial load, so it is reported once per page load.
let initialLoadTracked = false;

export default function App() {
  const [state, setState] = useState<AppState>({ counter: 0, lastAction: "none" });
  const [error, setError] = useState<string | null>(null);
  // Last state applied to the UI. Events compare each response against this
  // rather than the `state` captured at click time, so overlapping requests
  // (e.g. rapid clicks) each compare against the value they actually replace.
  const latestState = useRef(state);

  const run = async (action: Action, fn: () => Promise<AppState>, track = true) => {
    try {
      setError(null);
      const next = await fn();
      const previous = latestState.current;
      latestState.current = next;
      setState(next);
      if (track) trackSuccess(action, previous, next);
    } catch (e) {
      setError((e as Error).message);
      if (track) trackFailure(action, e);
    }
  };

  useEffect(() => {
    run("load", api.getState, !initialLoadTracked);
    initialLoadTracked = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 480, margin: "4rem auto", textAlign: "center" }}>
      <h1>QAWolf Demo</h1>

      <p data-testid="counter-value" style={{ fontSize: "3rem", margin: "1rem 0" }}>
        {state.counter}
      </p>
      <p data-testid="last-action" style={{ color: "#666" }}>
        Last action: {state.lastAction}
      </p>

      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        <button data-testid="btn-increment" onClick={() => run("increment", api.increment)}>
          Increment
        </button>
        <button data-testid="btn-decrement" onClick={() => run("decrement", api.decrement)}>
          Decrement
        </button>
        <button data-testid="btn-reset" onClick={() => run("reset", api.reset)}>
          Reset
        </button>
        <button data-testid="btn-refresh" onClick={() => run("refresh", api.getState)}>
          Refresh
        </button>
      </div>

      {error && (
        <p data-testid="error" style={{ color: "crimson", marginTop: 16 }}>
          {error}
        </p>
      )}
    </main>
  );
}
