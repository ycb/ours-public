import { useId, useRef, useState, type FormEvent } from "react";
import { useAuth } from "./authContext";

const NEUTRAL_FAILURE = "That didn't work. Check your email and password and try again.";

export function AlphaSignIn() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [failed, setFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const errorId = useId();
  const passwordRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setFailed(false);

    const result = await signIn(email.trim(), password).catch(() => ({ ok: false as const }));

    inFlight.current = false;
    if (!result.ok) {
      setSubmitting(false);
      setFailed(true);
      setPassword("");
      passwordRef.current?.focus();
    }
    // On success the auth boundary swaps this screen out; nothing else to do here.
  }

  return (
    <div className="auth-frame">
      <main id="main-content" className="auth-panel">
        <p className="wordmark auth-wordmark">Ours</p>
        <h1 className="auth-title">Sign in</h1>
        <p className="auth-copy">A private space for the two of you.</p>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <label className="field">
            <span className="field-label">Email</span>
            <input
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label className="field">
            <span className="field-label">Password</span>
            <input
              ref={passwordRef}
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              aria-invalid={failed || undefined}
              aria-describedby={failed ? errorId : undefined}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {failed ? (
            <p id={errorId} role="alert" className="form-error">
              {NEUTRAL_FAILURE}
            </p>
          ) : null}

          <button type="submit" className="button-primary" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </main>
    </div>
  );
}
