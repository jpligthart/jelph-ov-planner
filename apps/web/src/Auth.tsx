import { useEffect, useState, type FormEvent } from "react";
import { AUTH_REQUIRED_EVENT, fetchMe, login, logout } from "./api";
import { App } from "./App";
import { Logo } from "./Logo";

type State =
  | { kind: "checking" }
  | { kind: "login" }
  | { kind: "in"; user?: string; onLogout?: () => void };

/** Shows the planner once logged in (or when the API has login disabled). */
export function AuthGate() {
  const [state, setState] = useState<State>({ kind: "checking" });

  async function check() {
    try {
      const me = await fetchMe();
      if (me.auth === "disabled") setState({ kind: "in" });
      else if (me.user) setState({ kind: "in", user: me.user.name, onLogout: signOut });
      else setState({ kind: "login" });
    } catch {
      setState({ kind: "login" });
    }
  }

  async function signOut() {
    await logout();
    setState({ kind: "login" });
  }

  useEffect(() => {
    void check();
    const onRequired = () => setState({ kind: "login" });
    window.addEventListener(AUTH_REQUIRED_EVENT, onRequired);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, onRequired);
  }, []);

  if (state.kind === "checking") return null;
  if (state.kind === "login") return <Login onSuccess={() => void check()} />;
  return <App user={state.user} onLogout={state.onLogout} />;
}

function Login({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(
        message.startsWith("Request failed") || message.includes("fetch")
          ? "Inloggen lukt nu niet. Probeer het opnieuw."
          : message,
      );
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <Logo />
      </header>
      <main className="login">
        <form className="card login-card" onSubmit={onSubmit}>
          <h1>Inloggen</h1>
          {error ? (
            <div className="notice notice--error" role="alert">
              {error}
            </div>
          ) : null}
          <label className="field login-field">
            <span>Gebruikersnaam</span>
            <input
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </label>
          <label className="field login-field">
            <span>Wachtwoord</span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? (
              <>
                <span className="btn-spinner" aria-hidden="true" /> Inloggen…
              </>
            ) : (
              "Inloggen"
            )}
          </button>
        </form>
      </main>
    </div>
  );
}
