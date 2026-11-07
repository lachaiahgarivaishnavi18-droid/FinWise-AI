import React, { useEffect } from "react";
import {
  Leaf,
  X,
  ArrowLeftRight,
  Wallet,
  Heart,
  Plane,
  Sparkles,
  ArrowDownLeft,
  MoreHorizontal,
} from "lucide-react";
const categoryIcons = {
  Housing: Wallet,
  Food: Heart,
  Transportation: ArrowLeftRight,
  Travel: Plane,
  Shopping: Wallet,
  Entertainment: Sparkles,
};
function Button({
  children,
  onClick,
  secondary = false,
  className = "",
  ...props
}) {
  return (
    <button
      onClick={onClick}
      className={`${secondary ? "button-secondary" : "button-primary"} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
function Field({ label, children, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children || <input {...props} />}
    </label>
  );
}
function Empty({ icon: Icon = Leaf, title, description, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={25} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
function Modal({ title, children, onClose }) {
  useEffect(() => {
    const fn = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
function Logo() {
  return (
    <div className="logo">
      <span>
        <Leaf size={23} strokeWidth={2} />
      </span>
      finwise<span className="logo-dot">.</span>
    </div>
  );
}
function Stat({ title, value, icon: Icon, color, note }) {
  return (
    <section className="stat card">
      <div className="stat-top">
        <span>{title}</span>
        <span className={`stat-icon ${color}`}>
          <Icon size={17} />
        </span>
      </div>
      <strong>{value}</strong>
      <p>
        <span className="stat-dot" />
        {note}
      </p>
    </section>
  );
}
function CardTitle({ title, subtitle, right }) {
  return (
    <div className="card-title">
      <div>
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
function TransactionTable({ rows, fmt, onEdit }) {
  return rows.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Transaction</th>
            <th>Category</th>
            <th>Date</th>
            <th>Amount</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const Icon = categoryIcons[t.category] || Wallet;
            return (
              <tr key={t.kind + t.id}>
                <td>
                  <div className="transaction-name">
                    <span
                      className={`transaction-icon ${t.kind === "income" ? "income" : ""}`}
                    >
                      {t.kind === "income" ? (
                        <ArrowDownLeft size={17} />
                      ) : (
                        <Icon size={17} />
                      )}
                    </span>
                    <div>
                      <strong>{t.description}</strong>
                      <small>
                        {t.recurring
                          ? "Recurring transaction"
                          : t.kind === "income"
                            ? "Income received"
                            : "Personal expense"}
                      </small>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="category-tag">{t.category}</span>
                </td>
                <td>
                  {new Date(t.date + "T12:00:00").toLocaleDateString("en", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </td>
                <td
                  className={`amount ${t.kind === "income" ? "positive" : ""}`}
                >
                  {t.kind === "income" ? "+" : "−"}
                  {fmt(t.amount)}
                </td>
                <td>
                  <button
                    className="icon-button"
                    aria-label={`Edit ${t.description}`}
                    onClick={() => onEdit(t)}
                  >
                    <MoreHorizontal size={18} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty
      icon={ArrowLeftRight}
      title="No transactions yet"
      description="Add a transaction to start connecting the dots."
    />
  );
}

export { Button, Field, Empty, Modal, Logo, Stat, CardTitle, TransactionTable };
