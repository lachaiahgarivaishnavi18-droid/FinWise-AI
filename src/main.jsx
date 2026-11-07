import Auth from "./components/Auth";
import {
  Button,
  Field,
  Empty,
  Modal,
  Logo,
  Stat,
  CardTitle,
  TransactionTable,
} from "./components/ui";
import {
  modalTitles,
  ModalContent,
  SettingsPage,
} from "./components/FinanceForms";
import { api, getAccessToken, setAccessToken } from "./lib/api";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line, Doughnut, Bar } from "react-chartjs-2";
import {
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRight,
  Plus,
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  Target,
  Sparkles,
  Brain,
  Settings,
  ChevronDown,
  ChevronRight,
  Search,
  Bell,
  X,
  LogOut,
  Send,
  ShieldCheck,
  TrendingUp,
  MoreHorizontal,
  Pencil,
  Trash2,
  Check,
  Download,
  Menu,
  Leaf,
  CalendarDays,
  CheckCircle2,
  AlertCircle,
  Plane,
  Laptop,
  Heart,
  RefreshCw,
  LockKeyhole,
} from "lucide-react";
import "./styles.css";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
);
ChartJS.defaults.font.family = "Inter, ui-sans-serif, system-ui, sans-serif";
ChartJS.defaults.color = "#89918d";
const today = () => new Date().toLocaleDateString("en-CA");
const currentMonth = () => today().slice(0, 7);
const nav = [
  ["Overview", LayoutDashboard],
  ["Transactions", ArrowLeftRight],
  ["Budgets", Wallet],
  ["Goals", Target],
  ["AI Assistant", Sparkles],
  ["Memory", Brain],
];
const colors = [
  "#25826a",
  "#8ec4a8",
  "#b6d8c5",
  "#d8e7b0",
  "#f0d59c",
  "#95aabd",
  "#b1a0ca",
  "#d8b7b3",
  "#8fc5c9",
  "#d1d7d4",
];
const greeting = () =>
  new Date().getHours() < 12
    ? "Good morning"
    : new Date().getHours() < 17
      ? "Good afternoon"
      : "Good evening";
function App() {
  const [authenticated, setAuthenticated] = useState(!!getAccessToken()),
    [page, setPage] = useState("Overview"),
    [month, setMonth] = useState(currentMonth()),
    [profile, setProfile] = useState(null),
    [dashboard, setDashboard] = useState(null),
    [transactions, setTransactions] = useState([]),
    [categories, setCategories] = useState([]),
    [goals, setGoals] = useState([]),
    [budgets, setBudgets] = useState({ budgets: [], suggestions: [] }),
    [recs, setRecs] = useState([]),
    [memories, setMemories] = useState([]),
    [settings, setSettings] = useState({}),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [modal, setModal] = useState(null),
    [mobile, setMobile] = useState(false),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [category, setCategory] = useState(""),
    [minAmount, setMinAmount] = useState(""),
    [maxAmount, setMaxAmount] = useState(""),
    [startDate, setStartDate] = useState(""),
    [endDate, setEndDate] = useState(""),
    [chat, setChat] = useState([]),
    [input, setInput] = useState(""),
    [chatBusy, setChatBusy] = useState(false),
    [prediction, setPrediction] = useState(null);
  const fmt = (n, short = false) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: profile?.profile.currency || "INR",
      maximumFractionDigits: short ? 0 : 2,
      minimumFractionDigits: 0,
    }).format(n || 0);
  const notify = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 4500);
  };
  useEffect(() => {
    const fn = () => {
      setAccessToken(null);
      setAuthenticated(false);
      setProfile(null);
      setDashboard(null);
      setChat([]);
    };
    window.addEventListener("unauthorized", fn);
    return () => window.removeEventListener("unauthorized", fn);
  }, []);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const results = await Promise.all([
        api("/profile"),
        api(`/dashboard?month=${month}`),
        api(`/transactions?month=${month}`),
        api("/categories"),
        api("/goals"),
        api(`/budgets?month=${month}`),
        api(`/recommendations?month=${month}`),
        api("/memories"),
        api("/settings"),
      ]);
      setProfile(results[0]);
      setDashboard(results[1]);
      setTransactions(results[2]);
      setCategories(results[3]);
      setGoals(results[4]);
      setBudgets(results[5]);
      setRecs(results[6]);
      setMemories(results[7]);
      setSettings(results[8]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (authenticated) load();
  }, [authenticated, month]);
  useEffect(() => {
    if (authenticated)
      api("/chat")
        .then(setChat)
        .catch(() => {});
  }, [authenticated]);
  async function mutate(path, method, body, message = "Saved successfully.") {
    try {
      const result = await api(path, method, body);
      notify(message);
      await load();
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }
  async function logout() {
    try {
      await api("/auth/logout", "POST");
      sessionStorage.removeItem("finwise_token");
      setAccessToken(null);
      setAuthenticated(false);
      setChat([]);
      setProfile(null);
      setDashboard(null);
      setPrediction(null);
    } catch (err) {
      setError(err.message);
    }
  }
  function openTransaction(record) {
    setModal({ type: "transaction", record });
  }
  const pending = recs.filter((r) => r.status === "pending");
  const filtered = transactions.filter(
    (t) =>
      (filter === "all" || t.kind === filter) &&
      (!category ||
        (t.kind === "expense" && String(t.category_id) === category)) &&
      (!minAmount || t.amount >= Number(minAmount)) &&
      (!maxAmount || t.amount <= Number(maxAmount)) &&
      (!startDate || t.date >= startDate) &&
      (!endDate || t.date <= endDate) &&
      `${t.description} ${t.category}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const totalBudget = budgets.budgets
    .filter((b) => b.status === "accepted")
    .reduce((n, b) => n + b.amount, 0);
  const cashFlowOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#173c30",
        padding: 12,
        callbacks: { label: (c) => `${c.dataset.label}: ${fmt(c.parsed.y)}` },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { font: { size: 11 } },
      },
      y: {
        border: { display: false },
        grid: { color: "#edf0ed" },
        ticks: {
          font: { size: 10 },
          callback: (v) => (v >= 1000 ? `${v / 1000}k` : v),
        },
      },
    },
    interaction: { intersect: false, mode: "index" },
  };
  async function sendChat(message = input) {
    if (!message.trim() || chatBusy) return;
    const history = chat
      .slice(-12)
      .map(({ role, content }) => ({ role, content }));
    setChat((c) => [...c, { role: "user", content: message }]);
    setInput("");
    setChatBusy(true);
    try {
      const res = await api("/chat", "POST", { message, history });
      setChat((c) => [...c, { role: "assistant", ...res }]);
    } catch (err) {
      setChat((c) => [
        ...c,
        { role: "assistant", content: err.message, mode: "error" },
      ]);
    } finally {
      setChatBusy(false);
    }
  }
  function exportCSV() {
    const header = ["Date", "Description", "Type", "Category", "Amount"];
    const csv = [
      header,
      ...filtered.map((t) => [
        t.date,
        t.description,
        t.kind,
        t.category,
        t.amount,
      ]),
    ]
      .map((row) =>
        row
          .map(
            (v) =>
              '"' +
              String(v)
                .replace(/^[=+@\-\t\r]/, "'$&")
                .replaceAll('"', '""') +
              '"',
          )
          .join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `finwise-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  if (!authenticated) return <Auth onAuth={() => setAuthenticated(true)} />;
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "is-open" : ""}`}>
        <Logo />
        <div className="workspace">
          <span className="workspace-icon">P</span>
          <div>
            Personal workspace<small>Your everyday finances</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map(([label, Icon]) => (
            <button
              key={label}
              className={page === label ? "active" : ""}
              onClick={() => {
                setPage(label);
                setMobile(false);
              }}
            >
              <Icon size={19} />
              {label}
              {label === "AI Assistant" && (
                <span className="tiny-badge">AI</span>
              )}
              {label === "Memory" && memories.length > 0 && (
                <span className="nav-count">{memories.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="tip-icon">
              <Sparkles size={20} />
            </span>
            <h4>A little wiser, every day.</h4>
            <p>
              Your assistant remembers
              <br />
              only what you choose.
            </p>
            <button onClick={() => setPage("Memory")}>
              Explore your memory <ArrowUpRight size={14} />
            </button>
          </div>
          <button
            className={`settings-link ${page === "Settings" ? "active" : ""}`}
            onClick={() => setPage("Settings")}
          >
            <Settings size={19} />
            Settings & privacy
          </button>
          <div className="sidebar-user">
            <div className="avatar">
              {profile?.user.name?.slice(0, 1) || "Y"}
            </div>
            <div>
              {profile?.user.name || "Your account"}
              <small>Personal account</small>
            </div>
            <button
              className="icon-button"
              onClick={logout}
              aria-label="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open menu"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            <span>My workspace</span>
            <ChevronRight size={14} />
            <strong>{page}</strong>
          </div>
          <div className="topbar-right">
            <span className="secure-label">
              <span />
              Private & secure
            </span>
            <button
              className="notification-button icon-button"
              aria-label="View budget alerts"
              onClick={() => {
                setPage("Overview");
                notify(
                  pending.length
                    ? `${pending.length} insights need your review below.`
                    : "You’re all caught up.",
                );
              }}
            >
              <Bell size={19} />
              {pending.length > 0 && <i />}
            </button>
            <div className="avatar small">
              {profile?.user.name?.slice(0, 1) || "Y"}
            </div>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR MONEY, WITH MORE MEANING</div>
              <h1>
                {page === "Overview"
                  ? `${greeting()}, ${profile?.user.name?.split(" ")[0] || "there"}`
                  : page}
                {page === "Overview" && (
                  <span className="greeting-leaf">✳</span>
                )}
              </h1>
              <p>
                {
                  {
                    Overview:
                      "Here’s where you stand. Let’s make your next move a good one.",
                    Transactions:
                      "Every little transaction tells part of your story.",
                    Budgets: "A thoughtful plan for the things that matter.",
                    Goals: "Turn your someday into a plan for today.",
                    "AI Assistant":
                      "A clearer perspective on your financial life.",
                    Memory: "Personalized guidance. On your terms.",
                    Settings: "Make FinWise feel like you.",
                  }[page]
                }
              </p>
            </div>
            <div className="heading-actions">
              {["Overview", "Transactions", "Budgets"].includes(page) && (
                <label className="month-select">
                  <CalendarDays size={16} />
                  <input
                    type="month"
                    aria-label="Selected month"
                    value={month}
                    onChange={(e) => e.target.value && setMonth(e.target.value)}
                  />
                </label>
              )}
              {["Overview", "Transactions"].includes(page) && (
                <Button onClick={() => openTransaction()}>
                  <Plus size={17} />
                  Add transaction
                </Button>
              )}
              {page === "Goals" && (
                <Button onClick={() => setModal({ type: "goal" })}>
                  <Plus size={17} />
                  Create a goal
                </Button>
              )}
              {page === "Memory" && (
                <Button onClick={() => setModal({ type: "memory" })}>
                  <Plus size={17} />
                  Add a memory
                </Button>
              )}
            </div>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <AlertCircle size={17} />
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {!dashboard && loading ? (
            <div className="loading">
              <RefreshCw className="spin" /> Gathering your financial picture…
            </div>
          ) : (
            dashboard && (
              <>
                {page === "Overview" && (
                  <>
                    {!dashboard.transaction_count && (
                      <div className="welcome-banner">
                        <div>
                          <h3>A fresh page for your finances.</h3>
                          <p>
                            Add your first transaction, or explore FinWise with
                            clearly labeled sample data.
                          </p>
                        </div>
                        <Button
                          secondary
                          onClick={() => setModal({ type: "sample" })}
                        >
                          Explore sample data <ArrowRight size={16} />
                        </Button>
                      </div>
                    )}
                    <div className="stat-grid">
                      <Stat
                        title="Total income"
                        value={fmt(dashboard.income, true)}
                        icon={ArrowDownLeft}
                        color="green"
                        note="Recorded this month"
                      />
                      <Stat
                        title="Total expenses"
                        value={fmt(dashboard.expenses, true)}
                        icon={ArrowUpRight}
                        color="orange"
                        note="Across all categories"
                      />
                      <Stat
                        title="Available balance"
                        value={fmt(dashboard.savings, true)}
                        icon={Wallet}
                        color="blue"
                        note="Income minus expenses"
                      />
                      <Stat
                        title="Savings rate"
                        value={
                          dashboard.savings_rate === null
                            ? "—"
                            : dashboard.savings_rate + "%"
                        }
                        icon={TrendingUp}
                        color="purple"
                        note={
                          dashboard.savings_rate === null
                            ? "Add income to calculate"
                            : "Of recorded monthly income"
                        }
                      />
                    </div>
                    <div className="dashboard-row">
                      <section className="card cashflow">
                        <CardTitle
                          title="Money in, money out"
                          subtitle="A little perspective on your cash flow."
                          right={
                            <div className="chart-legend">
                              <span>
                                <i style={{ background: "#278468" }} />
                                Income
                              </span>
                              <span>
                                <i style={{ background: "#c3d8ca" }} />
                                Expenses
                              </span>
                            </div>
                          }
                        />
                        <div className="cashflow-summary">
                          <strong>{fmt(dashboard.savings, true)}</strong>
                          <span>net savings this month</span>
                          <span
                            className={`status-pill ${dashboard.savings < 0 ? "warning" : ""}`}
                          >
                            <TrendingUp size={12} />
                            {dashboard.savings >= 0
                              ? "Positive cash flow"
                              : "Spending exceeds income"}
                          </span>
                        </div>
                        <div className="chart-container">
                          <Bar
                            options={{
                              ...cashFlowOptions,
                              datasets: {
                                bar: { borderRadius: 5, maxBarThickness: 20 },
                              },
                              scales: {
                                ...cashFlowOptions.scales,
                                x: {
                                  ...cashFlowOptions.scales.x,
                                  grid: { display: false },
                                },
                              },
                            }}
                            data={{
                              labels: dashboard.trend.map((t) =>
                                new Date(t.month + "-02").toLocaleDateString(
                                  "en",
                                  { month: "short" },
                                ),
                              ),
                              datasets: [
                                {
                                  label: "Income",
                                  data: dashboard.trend.map((t) => t.income),
                                  backgroundColor: "#278468",
                                },
                                {
                                  label: "Expenses",
                                  data: dashboard.trend.map((t) => t.expenses),
                                  backgroundColor: "#c3d8ca",
                                },
                              ],
                            }}
                          />
                        </div>
                      </section>
                      <section className="card spending">
                        <CardTitle
                          title="Where your money goes"
                          subtitle="Your spending, in perspective."
                        />
                        <div className="donut-container">
                          {Object.keys(dashboard.categories).length ? (
                            <>
                              <Doughnut
                                data={{
                                  labels: Object.keys(dashboard.categories),
                                  datasets: [
                                    {
                                      data: Object.values(dashboard.categories),
                                      backgroundColor: colors,
                                      borderWidth: 4,
                                      borderColor: "#fff",
                                      hoverOffset: 3,
                                    },
                                  ],
                                }}
                                options={{
                                  cutout: "77%",
                                  maintainAspectRatio: false,
                                  plugins: {
                                    legend: { display: false },
                                    tooltip: {
                                      callbacks: {
                                        label: (c) =>
                                          `${c.label}: ${fmt(c.parsed)}`,
                                      },
                                    },
                                  },
                                }}
                              />
                              <div className="donut-center">
                                <span>Total spent</span>
                                <strong>{fmt(dashboard.expenses, true)}</strong>
                              </div>
                            </>
                          ) : (
                            <Empty
                              title="Your story starts here"
                              description="Add an expense to see your breakdown."
                            />
                          )}
                        </div>
                        <div className="category-legend">
                          {Object.entries(dashboard.categories)
                            .slice(0, 4)
                            .map(([cat, v], i) => (
                              <div key={cat}>
                                <span>
                                  <i style={{ background: colors[i] }} />
                                  {cat}
                                </span>
                                <strong>
                                  {dashboard.expenses
                                    ? Math.round((v / dashboard.expenses) * 100)
                                    : 0}
                                  %
                                </strong>
                              </div>
                            ))}
                        </div>
                      </section>
                    </div>
                    <div className="dashboard-row second-row">
                      <section className="card">
                        <CardTitle
                          title="Your goals, getting closer"
                          subtitle={`${goals.filter((g) => g.progress < 100).length} active goals. A future worth saving for.`}
                          right={
                            <button
                              className="text-button"
                              onClick={() => setPage("Goals")}
                            >
                              View all <ArrowRight size={14} />
                            </button>
                          }
                        />
                        {goals.length ? (
                          <div className="mini-goals">
                            {goals.slice(0, 3).map((g, i) => (
                              <div className="mini-goal" key={g.id}>
                                <div
                                  className={`goal-icon goal-color-${i % 3}`}
                                >
                                  {i === 0 ? (
                                    <ShieldCheck size={19} />
                                  ) : i === 1 ? (
                                    <Plane size={19} />
                                  ) : (
                                    <Laptop size={19} />
                                  )}
                                </div>
                                <div className="mini-goal-content">
                                  <div>
                                    <strong>{g.name}</strong>
                                    <span>{g.progress}%</span>
                                  </div>
                                  <div className="progress-track">
                                    <i
                                      style={{
                                        width: `${g.progress}%`,
                                        background: colors[i],
                                      }}
                                    />
                                  </div>
                                  <div className="goal-numbers">
                                    <span>
                                      {fmt(g.saved, true)}{" "}
                                      <small>
                                        of {fmt(g.target_amount, true)}
                                      </small>
                                    </span>
                                    <small>
                                      {g.on_track
                                        ? "On track"
                                        : "Needs attention"}
                                    </small>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <Empty
                            icon={Target}
                            title="What are you saving for?"
                            description="Give your money something to look forward to."
                            action={
                              <button
                                className="text-button"
                                onClick={() => setModal({ type: "goal" })}
                              >
                                Create your first goal <ArrowRight size={14} />
                              </button>
                            }
                          />
                        )}
                      </section>
                      <section className="insight-card">
                        <div className="insight-label">
                          <Sparkles size={17} />A LITTLE FINANCIAL WISDOM
                          <span>FOR YOU</span>
                        </div>
                        <h2>
                          {pending[0]?.title ||
                            "Your next good decision starts with a little clarity."}
                        </h2>
                        <p>
                          {pending[0]?.explanation ||
                            "Track your everyday spending, set a goal that matters to you, and let your financial picture come into focus."}
                        </p>
                        {pending[0] ? (
                          <button
                            onClick={() =>
                              setModal({
                                type: "recommendation",
                                record: pending[0],
                              })
                            }
                          >
                            Review suggestion <ArrowUpRight size={16} />
                          </button>
                        ) : (
                          <button onClick={() => setPage("AI Assistant")}>
                            Let’s talk about your money{" "}
                            <ArrowUpRight size={16} />
                          </button>
                        )}
                        <div className="insight-footer">
                          <ShieldCheck size={13} />
                          Based on your records. Always your decision.
                        </div>
                      </section>
                    </div>
                    <section className="card transactions-card">
                      <CardTitle
                        title="Recent transactions"
                        subtitle="The everyday moments behind the numbers."
                        right={
                          <button
                            className="text-button"
                            onClick={() => setPage("Transactions")}
                          >
                            View all transactions <ArrowRight size={14} />
                          </button>
                        }
                      />
                      <TransactionTable
                        rows={transactions.slice(0, 5)}
                        fmt={fmt}
                        onEdit={openTransaction}
                      />
                    </section>
                    {pending.length > 1 && (
                      <section className="recommendation-grid">
                        {pending.slice(1, 4).map((r) => (
                          <div className="card recommendation" key={r.id}>
                            <span className="pill">{r.priority} priority</span>
                            <h3>{r.title}</h3>
                            <p>{r.explanation}</p>
                            <button
                              className="text-button"
                              onClick={() =>
                                setModal({ type: "recommendation", record: r })
                              }
                            >
                              Review suggestion <ArrowRight size={14} />
                            </button>
                          </div>
                        ))}
                      </section>
                    )}
                  </>
                )}
                {page === "Transactions" && (
                  <>
                    <div className="stat-grid three">
                      <Stat
                        title="Monthly income"
                        value={fmt(dashboard.income, true)}
                        icon={ArrowDownLeft}
                        color="green"
                        note="Recorded income"
                      />
                      <Stat
                        title="Monthly expenses"
                        value={fmt(dashboard.expenses, true)}
                        icon={ArrowUpRight}
                        color="orange"
                        note="Recorded expenses"
                      />
                      <Stat
                        title="Transactions"
                        value={dashboard.transaction_count}
                        icon={ArrowLeftRight}
                        color="blue"
                        note="In the selected month"
                      />
                    </div>
                    <section className="card transactions-card">
                      <div className="table-controls">
                        <div className="tabs">
                          {["all", "expense", "income"].map((f) => (
                            <button
                              className={filter === f ? "selected" : ""}
                              onClick={() => setFilter(f)}
                              key={f}
                            >
                              {f === "all"
                                ? "All transactions"
                                : f === "expense"
                                  ? "Expenses"
                                  : "Income"}
                            </button>
                          ))}
                        </div>
                        <div className="table-actions">
                          <div className="search-input">
                            <Search size={16} />
                            <input
                              value={query}
                              onChange={(e) => setQuery(e.target.value)}
                              placeholder="Search transactions"
                              aria-label="Search transactions"
                            />
                          </div>
                          <Button secondary onClick={exportCSV}>
                            <Download size={15} />
                            Export
                          </Button>
                        </div>
                      </div>
                      <div className="filters">
                        <select
                          aria-label="Category filter"
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                        >
                          <option value="">All categories</option>
                          {categories.map((c) => (
                            <option value={c.id} key={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <input
                          aria-label="Minimum amount"
                          type="number"
                          min="0"
                          placeholder="Min amount"
                          value={minAmount}
                          onChange={(e) => setMinAmount(e.target.value)}
                        />
                        <input
                          aria-label="Maximum amount"
                          type="number"
                          min="0"
                          placeholder="Max amount"
                          value={maxAmount}
                          onChange={(e) => setMaxAmount(e.target.value)}
                        />
                        <input
                          aria-label="Start date"
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                        />
                        <input
                          aria-label="End date"
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                        />
                        <button
                          className="text-button"
                          onClick={() => {
                            setCategory("");
                            setMinAmount("");
                            setMaxAmount("");
                            setStartDate("");
                            setEndDate("");
                            setQuery("");
                            setFilter("all");
                          }}
                        >
                          Reset
                        </button>
                      </div>
                      <TransactionTable
                        rows={filtered}
                        fmt={fmt}
                        onEdit={openTransaction}
                      />
                      <div className="table-footer">
                        {filtered.length} transactions · {month} · max 1,000 per
                        type
                      </div>
                    </section>
                  </>
                )}
                {page === "Budgets" && (
                  <>
                    <div className="budget-hero">
                      <div>
                        <span className="eyebrow">YOUR SPENDING PLAN</span>
                        <h2>
                          {fmt(totalBudget, true)}{" "}
                          <small>planned this month</small>
                        </h2>
                        <p>
                          {fmt(dashboard.expenses, true)} spent ·{" "}
                          {fmt(
                            Math.max(0, totalBudget - dashboard.expenses),
                            true,
                          )}{" "}
                          left in your plan
                        </p>
                      </div>
                      <Button onClick={() => setModal({ type: "budget" })}>
                        <Plus size={16} />
                        Set category budget
                      </Button>
                    </div>
                    <div className="budget-grid">
                      {budgets.budgets
                        .filter((b) => b.status === "accepted")
                        .map((b, i) => (
                          <section className="card budget-card" key={b.id}>
                            <div className="budget-top">
                              <span className={`goal-icon goal-color-${i % 3}`}>
                                <Wallet size={19} />
                              </span>
                              <h3>{b.category}</h3>
                              <button
                                className="icon-button"
                                aria-label={`Edit ${b.category} budget`}
                                onClick={() =>
                                  setModal({ type: "budget", record: b })
                                }
                              >
                                <Pencil size={15} />
                              </button>
                            </div>
                            <h2>
                              {fmt(b.spent, true)}{" "}
                              <small>of {fmt(b.amount, true)}</small>
                            </h2>
                            <div className="progress-track">
                              <i
                                style={{
                                  width: `${Math.min(100, b.amount ? (b.spent / b.amount) * 100 : 100)}%`,
                                  background:
                                    b.spent > b.amount ? "#c6744a" : "#32866b",
                                }}
                              />
                            </div>
                            <div className="budget-meta">
                              <span>
                                {b.amount
                                  ? Math.round((b.spent / b.amount) * 100) +
                                    "% used"
                                  : "No allowance"}
                              </span>
                              <strong
                                className={
                                  b.spent > b.amount ? "negative" : "positive"
                                }
                              >
                                {b.spent > b.amount
                                  ? `${fmt(b.spent - b.amount, true)} over`
                                  : `${fmt(b.amount - b.spent, true)} left`}
                              </strong>
                            </div>
                          </section>
                        ))}
                    </div>
                    {!budgets.budgets.some((b) => b.status === "accepted") && (
                      <section className="card">
                        <Empty
                          icon={Wallet}
                          title="Give your money a plan"
                          description="Set spending limits for the categories you care about."
                        />
                      </section>
                    )}
                    <section className="card">
                      <CardTitle
                        title="A budget shaped by you"
                        subtitle="Suggested from completed-month spending and your preferred savings amount."
                        right={<Sparkles size={22} />}
                      />
                      {budgets.suggestions.length ? (
                        <div className="suggestion-list">
                          {budgets.suggestions.map((s) => (
                            <div className="suggestion-row" key={s.category_id}>
                              <div>
                                <strong>{s.category}</strong>
                                <small>
                                  {s.basis} · average{" "}
                                  {fmt(s.historical_average, true)}
                                </small>
                              </div>
                              <strong>{fmt(s.amount, true)}</strong>
                              <Button
                                secondary
                                onClick={() =>
                                  setModal({ type: "budget", record: s })
                                }
                              >
                                Review
                              </Button>
                              <button
                                className="icon-button"
                                aria-label={`Reject ${s.category} suggestion`}
                                onClick={() =>
                                  mutate(
                                    `/budgets?month=${month}`,
                                    "PUT",
                                    { ...s, status: "rejected" },
                                    "Suggestion rejected.",
                                  ).catch(() => {})
                                }
                              >
                                <X size={17} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Empty
                          icon={Brain}
                          title="A little history goes a long way"
                          description="Completed-month expense history is needed for personalized suggestions."
                        />
                      )}
                    </section>
                  </>
                )}
                {page === "Goals" && (
                  <>
                    <div className="goals-summary">
                      <span className="goal-icon">
                        <Target size={22} />
                      </span>
                      <div>
                        <strong>
                          {goals.length} goals. Endless possibilities.
                        </strong>
                        <p>
                          {fmt(
                            goals.reduce((a, g) => a + g.saved, 0),
                            true,
                          )}{" "}
                          set aside toward the things that matter.
                        </p>
                      </div>
                    </div>
                    <div className="goal-grid">
                      {goals.map((g, i) => (
                        <section className="card goal-card" key={g.id}>
                          <div className="goal-card-top">
                            <span className={`goal-icon goal-color-${i % 3}`}>
                              {i % 3 === 0 ? (
                                <ShieldCheck size={22} />
                              ) : i % 3 === 1 ? (
                                <Plane size={22} />
                              ) : (
                                <Laptop size={22} />
                              )}
                            </span>
                            <span
                              className={`status-pill ${g.on_track ? "" : "warning"}`}
                            >
                              {g.progress === 100
                                ? "Completed"
                                : g.overdue
                                  ? "Overdue"
                                  : g.on_track
                                    ? "On track"
                                    : "Needs attention"}
                            </span>
                            <button
                              className="icon-button"
                              aria-label={`Edit ${g.name}`}
                              onClick={() =>
                                setModal({ type: "goal", record: g })
                              }
                            >
                              <Pencil size={16} />
                            </button>
                          </div>
                          <h2>{g.name}</h2>
                          <p>
                            Target ·{" "}
                            {new Date(
                              g.target_date + "T12:00:00",
                            ).toLocaleDateString("en", {
                              month: "long",
                              year: "numeric",
                            })}
                          </p>
                          <div className="goal-amount">
                            <strong>{fmt(g.saved, true)}</strong>
                            <span>of {fmt(g.target_amount, true)}</span>
                          </div>
                          <div className="progress-track">
                            <i
                              style={{
                                width: g.progress + "%",
                                background: colors[i % colors.length],
                              }}
                            />
                          </div>
                          <div className="budget-meta">
                            <span>{g.progress}% complete</span>
                            <strong>{fmt(g.remaining, true)} to go</strong>
                          </div>
                          <div className="goal-plan">
                            <div>
                              <span>Monthly plan</span>
                              <strong>
                                {fmt(g.monthly_contribution, true)}
                              </strong>
                            </div>
                            <div>
                              <span>Monthly required</span>
                              <strong>{fmt(g.required_monthly, true)}</strong>
                            </div>
                          </div>
                          <Button
                            secondary
                            onClick={() =>
                              setModal({ type: "contribution", record: g })
                            }
                          >
                            <Plus size={16} />
                            Add contribution
                          </Button>
                        </section>
                      ))}
                      <button
                        className="new-goal"
                        onClick={() => setModal({ type: "goal" })}
                      >
                        <span>
                          <Plus size={26} />
                        </span>
                        <h3>What’s your next chapter?</h3>
                        <p>Big dreams start with a small plan.</p>Create a goal{" "}
                        <ArrowRight size={16} />
                      </button>
                    </div>
                    <p className="footnote">
                      Goal plans assume no investment returns. Contributions are
                      goal allocations and do not automatically create ledger
                      transactions.
                    </p>
                  </>
                )}
                {page === "AI Assistant" && (
                  <div className="assistant-layout">
                    <section className="card chat-card">
                      <div className="chat-header">
                        <span className="assistant-icon">
                          <Sparkles size={23} />
                        </span>
                        <div>
                          <h3>Your financial thinking partner</h3>
                          <p>Grounded in your records. Guided by you.</p>
                        </div>
                        <button
                          className="icon-button"
                          aria-label="Clear conversation"
                          onClick={() => setModal({ type: "clearChat" })}
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                      <div
                        className="chat-messages"
                        role="log"
                        aria-live="polite"
                      >
                        {!chat.length && (
                          <div className="chat-welcome">
                            <span className="assistant-icon large">
                              <Sparkles size={33} />
                            </span>
                            <h2>
                              A little clarity starts
                              <br />
                              with a conversation.
                            </h2>
                            <p>
                              Let’s make sense of your numbers and find a way
                              forward.
                            </p>
                            <div className="chat-prompts">
                              {[
                                "How much can I save this month?",
                                "Where am I spending the most?",
                                "Am I on track with my goals?",
                                "Compare my spending with last month.",
                              ].map((p) => (
                                <button key={p} onClick={() => sendChat(p)}>
                                  {p}
                                  <ArrowUpRight size={15} />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {chat.map((m, i) => (
                          <div key={i} className={`chat-message ${m.role}`}>
                            <span className="chat-avatar">
                              {m.role === "user" ? (
                                profile.user.name.slice(0, 1)
                              ) : (
                                <Sparkles size={17} />
                              )}
                            </span>
                            <div>
                              <small>
                                {m.role === "user" ? "You" : "FinWise"}
                                {m.mode &&
                                  m.mode !== "llm" &&
                                  ` · ${m.mode === "error" ? "Error" : "Calculation mode"}`}
                              </small>
                              <p>{m.content}</p>
                              {m.memory_candidate && (
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    setModal({
                                      type: "memory",
                                      candidate: m.memory_candidate,
                                    })
                                  }
                                >
                                  <Brain size={14} />
                                  Review memory
                                </button>
                              )}
                              {m.memory_ids?.length > 0 && (
                                <small>
                                  Retrieved memory IDs:{" "}
                                  {m.memory_ids.join(", ")}
                                </small>
                              )}
                            </div>
                          </div>
                        ))}
                        {chatBusy && (
                          <div className="chat-thinking">
                            <Sparkles size={16} className="spin" />
                            Making sense of your records…
                          </div>
                        )}
                      </div>
                      <form
                        className="chat-input"
                        onSubmit={(e) => {
                          e.preventDefault();
                          sendChat();
                        }}
                      >
                        <input
                          aria-label="Message FinWise"
                          placeholder="Ask about your money, your plans, your next step…"
                          value={input}
                          maxLength={4000}
                          onChange={(e) => setInput(e.target.value)}
                        />
                        <button
                          aria-label="Send message"
                          disabled={chatBusy || !input.trim()}
                        >
                          <Send size={19} />
                        </button>
                      </form>
                      <div className="chat-disclaimer">
                        <LockKeyhole size={12} />
                        {settings.chat_history
                          ? "Chat history retained for 30 days."
                          : "Chat history is off; context stays in this session."}{" "}
                        General budgeting education.
                      </div>
                    </section>
                    <aside className="assistant-context">
                      <section className="card">
                        <h3>
                          <Wallet size={18} />
                          Your financial context
                        </h3>
                        <div className="context-stat">
                          <span>Monthly income recorded</span>
                          <strong>{fmt(dashboard.income, true)}</strong>
                        </div>
                        <div className="context-stat">
                          <span>Expenses recorded</span>
                          <strong>{fmt(dashboard.expenses, true)}</strong>
                        </div>
                        <div className="context-stat">
                          <span>Active goals</span>
                          <strong>
                            {goals.filter((g) => g.progress < 100).length}
                          </strong>
                        </div>
                        <span className="pill">{dashboard.month}</span>
                      </section>
                      <section className="card memory-context">
                        <Brain size={22} />
                        <h3>Memory that’s yours.</h3>
                        <p>
                          {memories.filter((m) => !m.stale).length} current
                          approved memories. You choose what’s saved, corrected,
                          or forgotten.
                        </p>
                        <button
                          className="text-button"
                          onClick={() => setPage("Memory")}
                        >
                          Manage memory <ArrowRight size={14} />
                        </button>
                      </section>
                    </aside>
                  </div>
                )}
                {page === "Memory" && (
                  <>
                    <div className="privacy-banner">
                      <ShieldCheck size={26} />
                      <div>
                        <h3>
                          A more personal assistant. With your permission.
                        </h3>
                        <p>
                          Only memories you explicitly approve are saved here.
                          Expired memories are excluded from retrieval. Turning
                          memory off stops retrieval and new saves.
                        </p>
                      </div>
                      <span className="status-pill">
                        {settings.memory_enabled
                          ? "Memory enabled"
                          : "Memory paused"}
                      </span>
                    </div>
                    <div className="memory-summary">
                      <span>
                        {memories.length} saved memories ·{" "}
                        {memories.filter((m) => m.stale).length} need review
                      </span>
                      <div className="memory-summary-actions">
                        <button
                          className="text-button"
                          onClick={async () => {
                            try {
                              const result = await api("/memories/summary");
                              setModal({ type: "summary", record: result });
                            } catch (err) {
                              setError(err.message);
                            }
                          }}
                        >
                          Summarize <Sparkles size={14} />
                        </button>
                        <button
                          className="text-button danger"
                          onClick={() => setModal({ type: "clearMemory" })}
                        >
                          Forget all memories <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="memory-grid">
                      {memories.map((m) => (
                        <section className="card memory-card" key={m.id}>
                          <div className="memory-top">
                            <span className="pill">
                              <Brain size={13} />
                              {m.kind === "episodic"
                                ? "Life event"
                                : "Long-term memory"}
                            </span>
                            <span
                              className={`status-pill ${m.stale ? "warning" : ""}`}
                            >
                              {m.stale ? "Expired" : "Approved"}
                            </span>
                          </div>
                          <p>{m.content}</p>
                          <div className="memory-date">
                            Approved{" "}
                            {new Date(m.updated_at).toLocaleDateString()} ·
                            Expires{" "}
                            {new Date(m.expires_at).toLocaleDateString()}
                          </div>
                          <div className="memory-actions">
                            <button
                              className="text-button"
                              onClick={() =>
                                setModal({ type: "memory", record: m })
                              }
                            >
                              <Pencil size={14} />
                              Correct & approve
                            </button>
                            <button
                              className="icon-button"
                              aria-label="Delete memory"
                              onClick={() =>
                                setModal({ type: "deleteMemory", record: m })
                              }
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </section>
                      ))}
                    </div>
                    {!memories.length && (
                      <section className="card">
                        <Empty
                          icon={Brain}
                          title="A clean slate, by design."
                          description="Tell your assistant what matters to you. Review and approve each memory before it’s saved."
                          action={
                            <Button
                              secondary
                              onClick={() => setModal({ type: "memory" })}
                            >
                              Add your first memory <Plus size={15} />
                            </Button>
                          }
                        />
                      </section>
                    )}
                  </>
                )}
                {page === "Settings" && (
                  <SettingsPage
                    profile={profile}
                    settings={settings}
                    mutate={mutate}
                    setModal={setModal}
                    setChat={setChat}
                    notify={notify}
                  />
                )}
                {page === "Overview" && (
                  <section className="card savings-chart">
                    <CardTitle
                      title="Small steps. Growing possibilities."
                      subtitle="Your recorded monthly savings over time. Negative values mean expenses exceeded income."
                      right={<TrendingUp size={19} />}
                    />
                    <div className="chart-container">
                      <Line
                        options={cashFlowOptions}
                        data={{
                          labels: dashboard.trend.map((t) =>
                            new Date(t.month + "-02").toLocaleDateString("en", {
                              month: "short",
                            }),
                          ),
                          datasets: [
                            {
                              label: "Net savings",
                              data: dashboard.trend.map((t) => t.savings),
                              borderColor: "#32866b",
                              backgroundColor: "#32866b12",
                              fill: true,
                              tension: 0.35,
                              pointRadius: 3,
                              pointBackgroundColor: "#32866b",
                              borderWidth: 2,
                            },
                          ],
                        }}
                      />
                    </div>
                  </section>
                )}
                {page === "Overview" && (
                  <section className="card forecast-card">
                    <div>
                      <span className="pill">
                        <TrendingUp size={14} />
                        LOOKING AHEAD
                      </span>
                      <h3>Your next month, in perspective.</h3>
                      <p>
                        Train a personal forecast using completed-month records.
                        Evaluation uses a chronological holdout.
                      </p>
                    </div>
                    <Button
                      secondary
                      disabled={loading}
                      onClick={async () => {
                        setLoading(true);
                        try {
                          setPrediction(await api("/predictions", "POST", {}));
                        } catch (err) {
                          setError(err.message);
                        } finally {
                          setLoading(false);
                        }
                      }}
                    >
                      {loading ? "Working…" : "Analyze my history"}
                      <ArrowRight size={16} />
                    </Button>
                    {prediction && (
                      <div className="forecast-result">
                        {prediction.status === "trained" ? (
                          <>
                            <strong>
                              {fmt(prediction.predicted_expenses, true)}{" "}
                              predicted expenses for{" "}
                              {prediction.prediction_month}
                            </strong>
                            <p>
                              MAE {fmt(prediction.metrics.mae)} · RMSE{" "}
                              {fmt(prediction.metrics.rmse)} · R²{" "}
                              {prediction.metrics.r2 ?? "N/A"} ·{" "}
                              {prediction.metrics.test_months} test months
                            </p>
                            {prediction.savings_prediction && (
                              <p>
                                Estimated savings:{" "}
                                {fmt(prediction.savings_prediction.amount)} ·
                                savings MAE{" "}
                                {fmt(prediction.savings_prediction.metrics.mae)}
                              </p>
                            )}
                            <p>
                              {prediction.unusual_transaction_ids.length}{" "}
                              transactions flagged for review ·{" "}
                              {prediction.caveat}
                            </p>
                          </>
                        ) : (
                          <p>{prediction.reason}</p>
                        )}
                      </div>
                    )}
                  </section>
                )}
              </>
            )
          )}
          <footer className="page-footer">
            <span>
              <Leaf size={13} /> A little wiser with your money.
            </span>
            <span>
              General budgeting education · No investment, tax, or legal advice
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {modal && (
        <Modal title={modalTitles(modal)} onClose={() => setModal(null)}>
          <ModalContent
            modal={modal}
            categories={categories}
            profile={profile}
            month={month}
            mutate={mutate}
            close={() => setModal(null)}
            fmt={fmt}
            settings={settings}
            notify={notify}
            setChat={setChat}
          />
        </Modal>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
