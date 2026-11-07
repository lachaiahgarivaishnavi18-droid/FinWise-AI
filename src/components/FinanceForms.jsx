import React, { useState } from "react";
import {
  Plus,
  Check,
  ShieldCheck,
  Trash2,
  Target,
  Sparkles,
} from "lucide-react";
import { Button, Field, CardTitle } from "./ui";
import { api } from "../lib/api";
const today = () => new Date().toLocaleDateString("en-CA");
function modalTitles(m) {
  return (
    {
      transaction: m.record ? "Edit transaction" : "Add a transaction",
      goal: m.record ? "Edit your goal" : "Make a goal",
      budget: "Your category budget",
      contribution: "A step closer to your goal",
      memory: m.record ? "Correct your memory" : "Review & approve memory",
      sample: "Explore with sample data",
      recommendation: "A suggestion for you",
      clearMemory: "Forget all memories?",
      deleteMemory: "Forget this memory?",
      clearChat: "Clear your conversation?",
      summary: "Your memory, at a glance",
    }[m.type] || "Confirm"
  );
}
function ModalContent({
  modal: m,
  categories,
  profile,
  month,
  mutate,
  close,
  fmt,
  notify,
  setChat,
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [kind, setKind] = useState(m.record?.kind || "expense"),
    [suggestion, setSuggestion] = useState("");
  const r = m.record || {};
  async function perform(fn) {
    setError("");
    setBusy(true);
    try {
      await fn();
      close();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    if (m.type === "transaction") {
      body.kind = kind;
      body.recurring = body.recurring === "on";
      await perform(() =>
        mutate(
          r.id ? `/transactions/${kind}/${r.id}` : "/transactions",
          r.id ? "PATCH" : "POST",
          body,
          "Transaction saved.",
        ),
      );
    }
    if (m.type === "goal") {
      await perform(() =>
        mutate(
          r.id ? `/goals/${r.id}` : "/goals",
          r.id ? "PATCH" : "POST",
          body,
          "Goal saved.",
        ),
      );
    }
    if (m.type === "budget") {
      await perform(() =>
        mutate(
          `/budgets?month=${month}`,
          "PUT",
          { ...body, status: "accepted" },
          "Budget accepted.",
        ),
      );
    }
    if (m.type === "contribution") {
      await perform(() =>
        mutate(
          `/goals/${r.id}/contributions`,
          "POST",
          body,
          "Contribution added.",
        ),
      );
    }
    if (m.type === "memory") {
      body.consent = body.consent === "on";
      await perform(() =>
        mutate(
          r.id ? `/memories/${r.id}` : "/memories",
          r.id ? "PATCH" : "POST",
          body,
          "Approved memory saved.",
        ),
      );
    }
  }
  const footer = (
    <div className="modal-footer">
      <Button secondary type="button" onClick={close}>
        Cancel
      </Button>
      <Button type="submit" disabled={busy}>
        {busy
          ? "Saving…"
          : m.type === "memory"
            ? "Approve & save"
            : m.type === "budget"
              ? "Accept budget"
              : "Save"}
        <Check size={16} />
      </Button>
    </div>
  );
  return (
    <>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {m.type === "summary" && (
        <>
          <p className="modal-description summary-text">
            {r.summary || "No current approved memories to summarize."}
          </p>
          <p className="field-hint">{r.method}</p>
          <div className="modal-footer">
            <Button onClick={close}>Done</Button>
          </div>
        </>
      )}
      {m.type === "transaction" && (
        <form onSubmit={submit}>
          <div className="tabs transaction-type">
            {["expense", "income"].map((t) => (
              <button
                type="button"
                key={t}
                disabled={!!r.id}
                className={kind === t ? "selected" : ""}
                onClick={() => setKind(t)}
              >
                {t === "expense" ? "Money out" : "Money in"}
              </button>
            ))}
          </div>
          <Field
            label="Description"
            name="description"
            required
            maxLength={250}
            defaultValue={r.description}
            placeholder="What was it for?"
          />
          <div className="form-grid">
            <Field
              label={`Amount (${profile.profile.currency})`}
              type="number"
              min="0.01"
              max="999999999999"
              step="0.01"
              name="amount"
              required
              defaultValue={r.amount}
            />
            <Field
              label="Date"
              type="date"
              name="date"
              required
              defaultValue={r.date || today()}
            />
          </div>
          {kind === "expense" ? (
            <>
              <Field label="Category">
                <select
                  name="category_id"
                  defaultValue={r.category_id || categories[0]?.id}
                  required
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <button
                className="text-button categorize-button"
                type="button"
                onClick={async (e) => {
                  const form = e.currentTarget.form;
                  try {
                    const result = await api("/categorize", "POST", {
                      description: form.description.value,
                    });
                    if (result.category) {
                      const cat = categories.find(
                        (c) => c.name === result.category,
                      );
                      form.category_id.value = cat.id;
                      setSuggestion(
                        `Suggested ${result.category}. Holdout accuracy: ${Math.round(result.holdout_accuracy * 100)}% on ${result.test_records} records. Please review.`,
                      );
                    } else setSuggestion(result.reason);
                  } catch (err) {
                    setSuggestion(err.message);
                  }
                }}
              >
                <Sparkles size={14} />
                Suggest a category from my history
              </button>
              {suggestion && <p className="field-hint">{suggestion}</p>}
            </>
          ) : (
            <Field
              label="Income source"
              name="source"
              defaultValue={r.source || "Salary"}
              required
              maxLength={40}
            />
          )}
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="recurring"
              defaultChecked={r.recurring}
            />
            This is a recurring transaction
          </label>
          {r.id && (
            <button
              className="text-button danger"
              type="button"
              onClick={() =>
                perform(() =>
                  mutate(
                    `/transactions/${kind}/${r.id}`,
                    "DELETE",
                    null,
                    "Transaction deleted.",
                  ),
                )
              }
            >
              <Trash2 size={14} />
              Delete transaction
            </button>
          )}
          {footer}
        </form>
      )}
      {m.type === "goal" && (
        <form onSubmit={submit}>
          <Field
            label="What are you saving for?"
            name="name"
            required
            maxLength={100}
            defaultValue={r.name}
            placeholder="A dream trip, a little peace of mind…"
          />
          <div className="form-grid">
            <Field
              label="Target amount"
              name="target_amount"
              type="number"
              min="0.01"
              step="0.01"
              required
              defaultValue={r.target_amount}
            />
            <Field
              label="Already saved (before contributions)"
              name="initial_saved"
              type="number"
              min="0"
              step="0.01"
              required
              defaultValue={r.initial_saved || 0}
            />
            <Field
              label="Target date"
              name="target_date"
              type="date"
              required
              defaultValue={r.target_date}
            />
            <Field
              label="Planned monthly contribution"
              name="monthly_contribution"
              type="number"
              min="0"
              step="0.01"
              required
              defaultValue={r.monthly_contribution || 0}
            />
          </div>
          <Field label="Priority">
            <select name="priority" defaultValue={r.priority || "Medium"}>
              {["High", "Medium", "Low"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
          <p className="field-hint">
            Monthly savings are calculated without investment returns.
          </p>
          {r.id && (
            <button
              className="text-button danger"
              type="button"
              onClick={() =>
                perform(() =>
                  mutate(
                    `/goals/${r.id}`,
                    "DELETE",
                    null,
                    "Goal and contributions deleted.",
                  ),
                )
              }
            >
              <Trash2 size={14} />
              Delete goal & contributions
            </button>
          )}
          {footer}
        </form>
      )}
      {m.type === "budget" && (
        <form onSubmit={submit}>
          <p className="modal-description">
            Your spending limit for {month}. Adjust it to fit your priorities.
          </p>
          <Field label="Category">
            <select
              name="category_id"
              defaultValue={r.category_id || categories[0]?.id}
              required
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Monthly limit"
            name="amount"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue={r.amount}
          />
          {r.basis && (
            <p className="field-hint">
              Based on {r.basis}. Historical average:{" "}
              {fmt(r.historical_average)}.
            </p>
          )}
          {footer}
        </form>
      )}
      {m.type === "contribution" && (
        <form onSubmit={submit}>
          <div className="contribution-info">
            <Target size={23} />
            <div>
              <h3>{r.name}</h3>
              <p>{fmt(r.remaining)} left to reach your goal.</p>
            </div>
          </div>
          <Field
            label="Contribution amount"
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            required
          />
          <Field
            label="Date"
            name="date"
            type="date"
            required
            defaultValue={today()}
          />
          <p className="field-hint">
            This records a goal allocation; it does not change income or expense
            totals.
          </p>
          {footer}
        </form>
      )}
      {m.type === "memory" && (
        <form onSubmit={submit}>
          <div className="memory-consent-note">
            <ShieldCheck size={22} />
            <p>
              Review the exact information below. It will only be used for your
              personalized guidance. Never include passwords, card numbers, or
              secrets.
            </p>
          </div>
          <Field label="What would you like FinWise to remember?">
            <textarea
              name="content"
              rows={4}
              required
              maxLength={2000}
              defaultValue={r.content || m.candidate || ""}
              placeholder="I prefer to save at least 20% of my income."
            />
          </Field>
          {!r.id && (
            <div className="form-grid">
              <Field label="Memory type">
                <select name="kind">
                  <option value="long_term">Long-term preference</option>
                  <option value="episodic">Life event / decision</option>
                </select>
              </Field>
              <Field
                label="Review after (days)"
                name="expires_in_days"
                type="number"
                min="1"
                max="365"
                required
                defaultValue={90}
              />
            </div>
          )}
          <label className="checkbox-label consent">
            <input type="checkbox" name="consent" required />
            <span>
              I approve storing this exact information as a persistent memory. I
              can correct or delete it at any time.
            </span>
          </label>
          {r.id && (
            <p className="field-hint">
              Correcting this memory renews it for 90 days. Delete conflicting
              old memories separately.
            </p>
          )}
          {footer}
        </form>
      )}
      {m.type === "sample" && (
        <>
          <p className="modal-description">
            Add 10 months of fictional transactions, budgets, and three savings
            goals to this empty account. All transactions start with “Sample”.
            No AI memories are added.
          </p>
          <p className="field-hint">
            For real finances, create a separate account. These amounts are
            examples and do not represent you.
          </p>
          <div className="modal-footer">
            <Button secondary onClick={close}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                perform(() =>
                  mutate(
                    "/demo",
                    "POST",
                    {},
                    "Sample data loaded. All sample transactions are labeled.",
                  ),
                )
              }
            >
              Load sample data
            </Button>
          </div>
        </>
      )}
      {m.type === "recommendation" && (
        <>
          <span className="pill">{r.priority} priority</span>
          <h3 className="recommendation-title">{r.title}</h3>
          <p className="modal-description">{r.explanation}</p>
          <div className="recommendation-action">
            <strong>Suggested next step</strong>
            <p>{r.action}</p>
            <span>
              Potential amount to review: {fmt(r.impact)}. Savings are not
              guaranteed.
            </span>
          </div>
          <div className="modal-footer">
            <Button
              secondary
              onClick={() =>
                perform(() =>
                  mutate(
                    `/recommendations/${r.id}`,
                    "PATCH",
                    { status: "dismissed" },
                    "Suggestion dismissed.",
                  ),
                )
              }
            >
              Dismiss
            </Button>
            <Button
              secondary
              onClick={() =>
                perform(() =>
                  mutate(
                    `/recommendations/${r.id}`,
                    "PATCH",
                    { status: "rejected" },
                    "Suggestion rejected.",
                  ),
                )
              }
            >
              Reject
            </Button>
            <Button
              onClick={() =>
                perform(() =>
                  mutate(
                    `/recommendations/${r.id}`,
                    "PATCH",
                    { status: "accepted" },
                    "Recommendation accepted. No records were changed.",
                  ),
                )
              }
            >
              Accept idea <Check size={16} />
            </Button>
          </div>
        </>
      )}
      {["clearMemory", "deleteMemory", "clearChat"].includes(m.type) && (
        <>
          <p className="modal-description">
            {m.type === "clearChat"
              ? "Delete stored conversation history and clear this session. Approved memories are managed separately."
              : m.type === "deleteMemory"
                ? `This permanently deletes “${r.content}” and its embedding.`
                : "This permanently deletes all your approved memories and their embeddings."}
          </p>
          <div className="modal-footer">
            <Button secondary onClick={close}>
              Keep it
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                perform(async () => {
                  await mutate(
                    m.type === "clearChat"
                      ? "/chat"
                      : m.type === "deleteMemory"
                        ? `/memories/${r.id}`
                        : "/memories",
                    "DELETE",
                    null,
                    "Deleted.",
                  );
                  if (m.type === "clearChat") setChat([]);
                })
              }
            >
              Delete <Trash2 size={15} />
            </Button>
          </div>
        </>
      )}
    </>
  );
}
function SettingsPage({
  profile,
  settings,
  mutate,
  setModal,
  setChat,
  notify,
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await mutate(
        "/profile",
        "PATCH",
        Object.fromEntries(new FormData(e.target)),
        "Profile updated.",
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-layout">
      <section className="card profile-card">
        <CardTitle
          title="Your financial profile"
          subtitle="A starting point for your plans. Profile amounts do not create transactions."
        />
        <form onSubmit={save}>
          {error && <p className="form-error">{error}</p>}
          <div className="form-grid">
            <Field
              label="Your name"
              name="name"
              required
              defaultValue={profile.user.name}
            />
            <Field label="Currency">
              <select name="currency" defaultValue={profile.profile.currency}>
                {["INR", "USD", "EUR", "GBP"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            {[
              ["Monthly income", "monthly_income"],
              ["Fixed monthly expenses", "fixed_expenses"],
              ["Variable monthly expenses", "variable_expenses"],
              ["Existing savings", "savings"],
              ["Debt & liabilities", "debt"],
              ["Preferred monthly savings", "preferred_savings"],
            ].map(([label, key]) => (
              <Field
                key={key}
                label={label}
                name={key}
                type="number"
                min="0"
                step="0.01"
                required
                defaultValue={profile.profile[key]}
              />
            ))}
            <Field
              label="Income source"
              name="income_source"
              defaultValue={profile.profile.income_source}
            />
            <Field label="Risk preference">
              <select
                name="risk_preference"
                defaultValue={profile.profile.risk_preference}
              >
                {["Conservative", "Moderate", "Aggressive"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
          </div>
          {[
            ["Financial responsibilities", "responsibilities"],
            ["Financial preferences", "preferences"],
            ["Short-term goals", "short_term_goals"],
            ["Long-term goals", "long_term_goals"],
          ].map(([label, key]) => (
            <Field label={label} key={key}>
              <textarea
                name={key}
                rows={2}
                maxLength={2000}
                defaultValue={profile.profile[key]}
              />
            </Field>
          ))}
          <p className="field-hint">
            Currency can be selected before creating financial records. Existing
            amounts are never automatically converted. Profile information is
            stored for this account and is separate from conversational memory.
          </p>
          <Button disabled={busy}>
            {busy ? "Saving…" : "Save profile"}
            <Check size={16} />
          </Button>
        </form>
      </section>
      <div>
        <section className="card privacy-settings">
          <CardTitle
            title="Privacy, on your terms"
            subtitle="You’re always in control."
          />
          {[
            [
              "memory_enabled",
              "AI memory",
              "Retrieve approved memories and allow new approvals.",
            ],
            [
              "chat_history",
              "Save conversation history",
              "Opt in to 30-day history. Turning off deletes saved chat.",
            ],
            [
              "budget_alerts",
              "Budget alerts",
              "Choose whether budget alerts appear in your overview.",
            ],
          ].map(([key, label, desc]) => (
            <div className="setting-row" key={key}>
              <div>
                <strong>{label}</strong>
                <p>{desc}</p>
              </div>
              <button
                role="switch"
                aria-checked={!!settings[key]}
                aria-label={label}
                className={`toggle ${settings[key] ? "on" : ""}`}
                onClick={() =>
                  mutate(
                    "/settings",
                    "PATCH",
                    { [key]: !settings[key] },
                    "Privacy preference updated.",
                  )
                    .then(() => {
                      if (key === "chat_history" && settings[key]) {
                        setChat([]);
                      }
                    })
                    .catch(() => {})
                }
              >
                <span />
              </button>
            </div>
          ))}
          <button
            className="text-button danger"
            onClick={() => setModal({ type: "clearChat" })}
          >
            Delete chat history <Trash2 size={14} />
          </button>
          <button
            className="text-button danger"
            onClick={() => setModal({ type: "clearMemory" })}
          >
            Forget all memories <Trash2 size={14} />
          </button>
        </section>
        <section className="card about-card">
          <ShieldCheck size={24} />
          <h3>Built around your trust.</h3>
          <p>
            FinWise offers general budgeting education. It does not provide
            regulated investment, tax, or legal advice. Predictions are
            estimates based on your records.
          </p>
          <p>No bank connections or payment credentials are needed.</p>
        </section>
      </div>
    </div>
  );
}

export { modalTitles, ModalContent, SettingsPage };
