import { useEffect, useState } from "react";
import { api, ApiError, type AppState } from "./api";

// Counter actions. A successful one is tracked as `demo-<action>` (e.g.
// "demo-increment"); a failed one as "demo-action-failed".
type Action = "load" | "increment" | "decrement" | "reset" | "refresh";

type TrackProperties = Record<string, unknown>;

// Seam for Pendo. Novus installs the Pendo agent, which provides window.pendo
// at runtime; this fires a Track Event for each action. No-op when the agent
// isn't present (local dev), so the app and Playwright mocks both stay simple.
function trackEvent(name: Action | "action-failed", properties?: TrackProperties) {
  if (typeof window !== "undefined") {
    window.pendo?.track?.(`demo-${name}`, properties);
  }
}

// Properties sent when an action succeeds. `next` is the state the server
// returned (its counter is one global value shared by all visitors);
// `previousCounter` is the value that was on screen before the request.
function successProperties(name: Action, next: AppState, previousCounter: number): TrackProperties {
  switch (name) {
    case "load":
      // What the user first saw. previousCounter would always be the initial 0.
      return { counter: next.counter, lastAction: next.lastAction };
    case "increment":
    case "decrement":
      // lastAction always equals the action here, so only the new value is useful.
      return { counter: next.counter };
    case "reset":
      // The new counter is always 0; how far the user got before resetting is what matters.
      return { previousCounter };
    case "refresh":
      // counter vs previousCounter shows whether the refresh picked up new data.
      return { counter: next.counter, lastAction: next.lastAction, previousCounter };
  }
}

export default function App() {
  const [state, setState] = useState<AppState>({ counter: 0, lastAction: "none" });
  const [error, setError] = useState<string | null>(null);

  const run = async (name: Action, fn: () => Promise<AppState>) => {
    const previousCounter = state.counter;
    try {
      setError(null);
      const next = await fn();
      setState(next);
      trackEvent(name, successProperties(name, next, previousCounter));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      trackEvent("action-failed", {
        action: name,
        // HTTP status of a non-2xx response; absent for network failures (the
        // request never reached the server) and for unreadable response bodies.
        status: e instanceof ApiError ? e.status : undefined,
        // Truncated to keep the event well under Pendo's 512-byte property limit.
        errorMessage: message.slice(0, 100),
      });
    }
  };

  useEffect(() => {
    run("load", api.getState);
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
