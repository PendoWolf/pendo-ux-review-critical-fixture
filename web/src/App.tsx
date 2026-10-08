import { useEffect, useState } from "react";
import { api, type AppState } from "./api";

// Actions that go through run(). Each one that succeeds fires demo-<action>.
type Action = "load" | "increment" | "decrement" | "reset" | "refresh";

// Seam for Pendo. Novus installs the Pendo agent, which provides window.pendo
// at runtime; this fires a Track Event named demo-<name>, with optional properties.
// No-op when the agent isn't present (local dev), so the app and Playwright mocks
// both stay simple.
function trackEvent(name: Action | "action-failed", props?: Record<string, unknown>) {
  if (typeof window !== "undefined") {
    window.pendo?.track?.(`demo-${name}`, props);
  }
}

// Properties for the demo-<action> event sent when an action succeeds, from the
// state on screen when it started (before) and the state the API returned (after).
function actionProps(name: Action, before: AppState, after: AppState): Record<string, unknown> {
  switch (name) {
    case "load":
      return { counter: after.counter, last_action: after.lastAction };
    case "increment":
    case "decrement":
      return {
        counter_before: before.counter,
        counter_after: after.counter,
        previous_last_action: before.lastAction,
      };
    case "reset":
      // The counter is always 0 after a reset, so counter_after isn't sent.
      return { counter_before: before.counter, previous_last_action: before.lastAction };
    case "refresh":
      return {
        counter_before: before.counter,
        counter_after: after.counter,
        counter_changed: after.counter !== before.counter,
        last_action: after.lastAction,
      };
  }
}

// React StrictMode runs mount effects twice in development, so the initial load
// runs twice there. Its outcome (demo-load, or demo-action-failed with action
// "load") is reported once per page load; module-level so a remount can't reset it.
let initialLoadReported = false;

export default function App() {
  const [state, setState] = useState<AppState>({ counter: 0, lastAction: "none" });
  const [error, setError] = useState<string | null>(null);

  const run = async (name: Action, fn: () => Promise<AppState>, report = true) => {
    const before = state;
    let after: AppState;
    try {
      setError(null);
      after = await fn();
    } catch (e) {
      // call() in api.ts attaches the HTTP status to errors for non-2xx responses.
      const err = e as Error & { status?: number };
      setError(err.message);
      if (report) {
        trackEvent("action-failed", {
          action: name,
          // Truncated to stay well within Pendo's 512-byte limit for properties.
          error_message: err.message.slice(0, 100),
          http_status: err.status,
          // With no status, either fetch rejected (TypeError: API unreachable or blocked
          // by CORS) or res.json() did (SyntaxError: the response wasn't JSON).
          error_type: err.status !== undefined ? "http" : err instanceof TypeError ? "network" : "invalid_response",
        });
      }
      return;
    }
    setState(after);
    // Outside the try, so a tracking problem can't surface as a failed action.
    if (report) trackEvent(name, actionProps(name, before, after));
  };

  useEffect(() => {
    run("load", api.getState, !initialLoadReported);
    initialLoadReported = true;
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
