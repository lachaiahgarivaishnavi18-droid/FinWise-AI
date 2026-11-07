import React, { useState } from "react";
import {
  ArrowRight,
  Sparkles,
  ShieldCheck,
  TrendingUp,
  Leaf,
  LockKeyhole,
} from "lucide-react";
import { Button, Field, Logo } from "./ui";
import { api, setAccessToken } from "../lib/api";
function Auth({ onAuth }) {
  const [register, setRegister] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = Object.fromEntries(new FormData(e.target));
      const result = await api(
        "/auth/" + (register ? "register" : "login"),
        "POST",
        data,
      );
      setAccessToken(result.token);
      onAuth();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <Logo />
        <div>
          <div className="eyebrow">A LITTLE CLARITY. A LOT OF POSSIBILITY.</div>
          <h1>
            Your money.
            <br />A more thoughtful
            <br />
            <em>way forward.</em>
          </h1>
          <p>
            Build better habits, make space for your goals, and get guidance
            that grows with you.
          </p>
          <div className="auth-art">
            <div className="orbit o1" />
            <div className="orbit o2" />
            <div className="orbit o3" />
            <div className="art-core">
              <Leaf size={60} />
            </div>
            <span className="art-tag">
              <TrendingUp size={18} /> Small steps. Meaningful progress.
            </span>
          </div>
        </div>
        <small>
          <ShieldCheck size={16} /> Your finances are personal. Your memory is
          your choice.
        </small>
      </section>
      <section className="auth-form">
        <div className="auth-form-inner">
          <span className="pill">
            <Sparkles size={14} /> YOUR FINANCIAL FRESH START
          </span>
          <h2>{register ? "Make room for what matters." : "Welcome back."}</h2>
          <p>
            {register
              ? "Create your account and find your financial rhythm."
              : "Let’s pick up where you left off."}
          </p>
          <form onSubmit={submit}>
            {register && (
              <Field
                label="Your name"
                name="name"
                autoComplete="name"
                required
                placeholder="Alex Morgan"
                maxLength={100}
              />
            )}
            <Field
              label="Email address"
              type="email"
              name="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
            <Field
              label="Password"
              type="password"
              name="password"
              autoComplete={register ? "new-password" : "current-password"}
              minLength={register ? 12 : 1}
              maxLength={128}
              required
              placeholder={
                register ? "At least 12 characters" : "Your password"
              }
            />
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <Button disabled={busy} type="submit">
              {busy ? "One moment…" : register ? "Create account" : "Sign in"}
              <ArrowRight size={17} />
            </Button>
          </form>
          <p className="auth-switch">
            {register ? "Already have an account?" : "New to FinWise?"}{" "}
            <button
              onClick={() => {
                setRegister(!register);
                setError("");
              }}
            >
              {register ? "Sign in" : "Create an account"}
            </button>
          </p>
          <div className="auth-note">
            <LockKeyhole size={17} />
            <p>
              Passwords are hashed. Long-term AI memories are saved only when
              you approve them.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Auth;
