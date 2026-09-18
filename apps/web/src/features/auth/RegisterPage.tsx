import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { ApiError } from "../../lib/api";

export function RegisterPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="page auth-page">
      <section className="panel auth-panel">
        <div className="panel__head">
          <h1>Create your account</h1>
        </div>
        <p className="muted">
          Your own studio, your own subscription, your own shoots — nobody else can see them.
        </p>
        <form
          className="auth-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            setPending(true);
            try {
              await auth.register(name, email, password);
              navigate("/", { replace: true });
            } catch (err) {
              setError(err instanceof ApiError ? err.message : "Something went wrong.");
            } finally {
              setPending(false);
            }
          }}
        >
          <div className="field">
            <label htmlFor="register-name">Your name (or studio name)</label>
            <input
              id="register-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="register-email">Email</label>
            <input
              id="register-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="register-password">Password</label>
            <input
              id="register-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <span className="muted">At least 8 characters.</span>
          </div>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="button button--primary" disabled={pending}>
            {pending ? "Creating account…" : "Create account"}
          </button>
        </form>
        <p className="muted">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </section>
    </div>
  );
}
