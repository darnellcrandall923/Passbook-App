import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  LayoutDashboard, Receipt, Wallet, Target, Plus, Trash2, Upload,
  TrendingUp, TrendingDown, X, Pencil, ChevronRight, PiggyBank, CalendarDays, ArrowRight, Calculator, LogOut, FileUp, Menu
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  XAxis, YAxis, CartesianGrid, LineChart, Line
} from "recharts";
import Papa from "papaparse";
import { supabase } from "./lib/supabase";
import { loadAll, save } from "./lib/storage";
import Auth from "./Auth.jsx";

/* ---------- tokens ---------- */
const T = {
  paper: "#EFECDF",
  surface: "#FAF8F0",
  ink: "#1E2A22",
  inkSoft: "#5B6459",
  brass: "#A9824C",
  brassLight: "#EFE1C8",
  positive: "#3F7A5C",
  positiveBg: "#E3EEE4",
  negative: "#A64B3A",
  negativeBg: "#F3E3DE",
  line: "#DAD5C3",
};

const CATEGORIES = [
  "Income", "Housing", "Utilities", "Groceries", "Dining",
  "Transportation", "Shopping", "Entertainment", "Health",
  "Travel", "Subscriptions", "Savings & Transfers", "Other",
];

const CAT_COLOR = {
  Income: "#3F7A5C", Housing: "#8E6C4E", Utilities: "#7A8C8A",
  Groceries: "#7C9A4A", Dining: "#C07A3E", Transportation: "#5B7FA6",
  Shopping: "#B0587C", Entertainment: "#8E6CBF", Health: "#4E9C9C",
  Travel: "#C99A3E", Subscriptions: "#9A6C8E", "Savings & Transfers": "#4E7C6C",
  Other: "#9A9488",
};

const KEYWORD_MAP = [
  [/salary|payroll|direct dep/i, "Income"],
  [/rent|mortgage/i, "Housing"],
  [/electric|water bill|gas bill|internet|comcast|xfinity|utility/i, "Utilities"],
  [/grocery|market|whole foods|trader joe|safeway|kroger/i, "Groceries"],
  [/starbucks|coffee|restaurant|dining|doordash|ubereats|grubhub|cafe/i, "Dining"],
  [/uber|lyft|gas station|shell|chevron|transit|parking/i, "Transportation"],
  [/amazon|target|walmart|store|shop/i, "Shopping"],
  [/netflix|spotify|hulu|disney\+|movie|theater|steam/i, "Entertainment"],
  [/pharmacy|doctor|clinic|dental|health/i, "Health"],
  [/airline|hotel|airbnb|flight|travel/i, "Travel"],
  [/subscription|membership/i, "Subscriptions"],
  [/transfer|savings/i, "Savings & Transfers"],
];

const ACCOUNT_TYPES = [
  { id: "checking", label: "Checking", liability: false },
  { id: "savings", label: "Savings", liability: false },
  { id: "investment", label: "Investment", liability: false },
  { id: "credit", label: "Credit card", liability: true },
  { id: "loan", label: "Loan", liability: true },
];

const BUDGET_PERIODS = [
  { id: "weekly", label: "Weekly", sub: "rolling 7 days" },
  { id: "biweekly", label: "Biweekly", sub: "rolling 14 days" },
  { id: "monthly", label: "Monthly", sub: "calendar month" },
];

function periodRange(period) {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "monthly") {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 0) };
  }
  if (period === "biweekly") {
    const start = new Date(end); start.setDate(start.getDate() - 13);
    return { start, end };
  }
  const start = new Date(end); start.setDate(start.getDate() - 6);
  return { start, end };
}

function inRange(dateStr, range) {
  const d = parseDateStr(dateStr);
  return d >= range.start && d <= new Date(range.end.getFullYear(), range.end.getMonth(), range.end.getDate(), 23, 59, 59);
}

function spentFor(transactions, category, period) {
  const range = periodRange(period);
  return transactions
    .filter((t) => t.amount < 0 && inRange(t.date, range) && (category === "Overall" || t.category === category))
    .reduce((s, t) => s + Math.abs(t.amount), 0);
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const parseDateStr = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const toDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

// Tracks whether the viewport is phone-sized, so components can switch
// multi-column layouts to a single stacked column below this width.
const MOBILE_BREAKPOINT = 700;
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const handler = (e) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

const FREQUENCIES = [
  { id: "once", label: "One time" },
  { id: "weekly", label: "Weekly" },
  { id: "biweekly", label: "Every 2 weeks" },
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
];

function occurrencesInRange(item, rangeStart, rangeEnd) {
  const start = parseDateStr(item.startDate);
  const results = [];
  if (item.frequency === "once") {
    if (start >= rangeStart && start <= rangeEnd) results.push(start);
    return results;
  }
  if (item.frequency === "weekly" || item.frequency === "biweekly") {
    const step = item.frequency === "weekly" ? 7 : 14;
    let cursor = new Date(start);
    if (cursor < rangeStart) {
      const diffDays = Math.floor((rangeStart - cursor) / 86400000);
      cursor = addDays(cursor, Math.floor(diffDays / step) * step);
      while (cursor < rangeStart) cursor = addDays(cursor, step);
    }
    while (cursor <= rangeEnd) { results.push(new Date(cursor)); cursor = addDays(cursor, step); }
    return results;
  }
  if (item.frequency === "monthly") {
    const day = start.getDate();
    let cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    while (cursor <= rangeEnd) {
      const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
      const occ = new Date(cursor.getFullYear(), cursor.getMonth(), Math.min(day, lastDay));
      if (occ >= start && occ >= rangeStart && occ <= rangeEnd) results.push(occ);
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    return results;
  }
  if (item.frequency === "yearly") {
    for (let y = rangeStart.getFullYear(); y <= rangeEnd.getFullYear(); y++) {
      const occ = new Date(y, start.getMonth(), start.getDate());
      if (occ >= start && occ >= rangeStart && occ <= rangeEnd) results.push(occ);
    }
    return results;
  }
  return results;
}

function scheduledSpendFor(scheduled, category, period) {
  const range = periodRange(period);
  let total = 0;
  scheduled.forEach((item) => {
    if (item.amount >= 0) return;
    if (category !== "Overall" && item.category !== category) return;
    total += Math.abs(item.amount) * occurrencesInRange(item, range.start, range.end).length;
  });
  return total;
}

function budgetMonthlyEquivalent(b, daysInMonth) {
  if (b.period === "weekly") return b.amount * (daysInMonth / 7);
  if (b.period === "biweekly") return b.amount * (daysInMonth / 14);
  return b.amount;
}

function budgetWeeklyEquivalent(b, daysInMonth) {
  if (b.period === "monthly") return b.amount * (7 / daysInMonth);
  if (b.period === "biweekly") return b.amount / 2;
  return b.amount;
}

function rangeTotals(scheduled, start, end) {
  let income = 0, bills = 0;
  scheduled.forEach((item) => {
    const occ = occurrencesInRange(item, start, end).length;
    if (occ === 0) return;
    if (item.amount >= 0) income += item.amount * occ; else bills += Math.abs(item.amount) * occ;
  });
  return { income, bills };
}

function computeMonthlyPlan(scheduled, monthStart, monthEnd) {
  const incomeOccurrences = [];
  const billOccurrences = [];
  scheduled.forEach((item) => {
    const occs = occurrencesInRange(item, monthStart, monthEnd);
    occs.forEach((d) => {
      if (item.amount >= 0) incomeOccurrences.push({ date: d, name: item.name, amount: item.amount, id: item.id });
      else billOccurrences.push({ date: d, name: item.name, amount: Math.abs(item.amount), category: item.category });
    });
  });
  incomeOccurrences.sort((a, b) => a.date - b.date);
  billOccurrences.sort((a, b) => a.date - b.date);

  const totalIncome = incomeOccurrences.reduce((s, o) => s + o.amount, 0);
  const totalBills = billOccurrences.reduce((s, o) => s + o.amount, 0);

  const buckets = incomeOccurrences.map((occ) => ({ ...occ, bills: [], billTotal: 0 }));
  const carried = { bills: [], billTotal: 0 };
  billOccurrences.forEach((bill) => {
    let idx = -1;
    for (let i = 0; i < buckets.length; i++) { if (buckets[i].date <= bill.date) idx = i; else break; }
    if (idx === -1) carried.bills.push(bill); else buckets[idx].bills.push(bill);
  });
  buckets.forEach((b) => { b.billTotal = b.bills.reduce((s, x) => s + x.amount, 0); });
  carried.billTotal = carried.bills.reduce((s, x) => s + x.amount, 0);

  const sourceMap = {};
  incomeOccurrences.forEach((occ) => {
    if (!sourceMap[occ.name]) sourceMap[occ.name] = { name: occ.name, total: 0, occurrences: 0 };
    sourceMap[occ.name].total += occ.amount;
    sourceMap[occ.name].occurrences += 1;
  });
  const sources = Object.values(sourceMap).map((s) => {
    const share = totalIncome > 0 ? s.total / totalIncome : 0;
    const billShare = totalBills * share;
    return { ...s, share, billShare, leftover: s.total - billShare };
  });

  return { incomeOccurrences, billOccurrences, buckets, carried, totalIncome, totalBills, sources };
}

// Spreads a month's total discretionary pool (income - bills - budgets)
// evenly across every day of the month, so the weekly figure never jumps
// around just because a paycheck or bill happens to land in a given week.
// Weeks that take in more than their flat share bank the difference as a
// buffer; weeks with heavier bills draw the buffer back down.
function computeWeeklySmoothedPlan(scheduled, monthStart, monthEnd, pool) {
  const totalDays = Math.round((monthEnd - monthStart) / 86400000) + 1;
  const dailyRate = totalDays > 0 ? pool / totalDays : 0;
  const weeks = [];
  let cursor = new Date(monthStart);
  let cumulativeNet = 0, cumulativeTarget = 0;
  while (cursor <= monthEnd) {
    const weekEndCandidate = addDays(cursor, 6);
    const weekEnd = weekEndCandidate <= monthEnd ? weekEndCandidate : new Date(monthEnd);
    const days = Math.round((weekEnd - cursor) / 86400000) + 1;
    const totals = rangeTotals(scheduled, cursor, weekEnd);
    const net = totals.income - totals.bills;
    const target = dailyRate * days;
    cumulativeNet += net;
    cumulativeTarget += target;
    weeks.push({
      start: new Date(cursor), end: new Date(weekEnd), days,
      income: totals.income, bills: totals.bills, net, target,
      bufferAfter: cumulativeNet - cumulativeTarget,
    });
    cursor = addDays(weekEnd, 1);
  }
  return { dailyRate, weeklyTarget: dailyRate * 7, weeks };
}

const fmt = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthKey = (d) => d.slice(0, 7);
const todayStr = () => new Date().toISOString().slice(0, 10);

function guessCategory(desc) {
  for (const [re, cat] of KEYWORD_MAP) if (re.test(desc)) return cat;
  return "";
}

/* ---------- storage ----------
   Data now lives in Supabase (Postgres + auth), so it syncs across every
   device you sign in on. See src/lib/storage.js for the implementation. */

/* ---------- small UI atoms ---------- */
function Card({ children, style, ...rest }) {
  return (
    <div
      style={{
        background: T.surface, border: `0.5px solid ${T.line}`,
        borderRadius: 12, padding: "1.1rem 1.25rem", ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

function Money({ value, size = 15 }) {
  const positive = value >= 0;
  return (
    <span style={{
      fontFamily: "'IBM Plex Mono', monospace", fontSize: size, fontVariantNumeric: "tabular-nums",
      color: positive ? T.positive : T.negative, fontWeight: 500,
    }}>
      {fmt(value)}
    </span>
  );
}

function Pill({ text, color }) {
  return (
    <span style={{
      fontSize: 12, padding: "3px 9px", borderRadius: 999,
      background: color + "22", color, fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 500,
    }}>
      {text}
    </span>
  );
}

function Empty({ icon: Icon, title, body }) {
  return (
    <div style={{ textAlign: "center", padding: "3rem 1rem", color: T.inkSoft }}>
      <Icon size={28} style={{ opacity: 0.5, marginBottom: 10 }} />
      <div style={{ fontFamily: "Fraunces, serif", fontSize: 18, color: T.ink, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13.5 }}>{body}</div>
    </div>
  );
}

/* ---------- stamp progress ring (signature element) ---------- */
function SpendingLimitCard({ title, income, bills, budgeted, limit: limitOverride, spent, hasData, onManage, manageLabel, note, noteColor, subtitle }) {
  const limit = limitOverride != null ? limitOverride : income - bills - budgeted;
  const ratio = limit > 0 ? spent / limit : (spent > 0 ? 1.5 : 0);
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 6 }}>{title}</div>
          {!hasData ? (
            <Empty icon={Calculator} title="No plan yet" body="Add income and bills on Calendar, or a budget on the Budgets tab, to see a spending limit here." />
          ) : (
            <div style={{ fontFamily: "Fraunces, serif", fontSize: 28 }}>{fmt(Math.max(0, limit))}</div>
          )}
        </div>
        {hasData && onManage && (
          <button onClick={onManage} className="btn secondary" style={{ padding: "3px 8px", fontSize: 11 }}>{manageLabel} <ChevronRight size={12} /></button>
        )}
      </div>
      {hasData && (
        <>
          {subtitle && <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 4 }}>{subtitle}</div>}
          {income != null && (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11.5, color: T.inkSoft, marginTop: 10, fontFamily: "'IBM Plex Mono', monospace" }}>
              <span>Income {fmt(income)}</span>
              <span>− Bills {fmt(bills)}</span>
              <span>− Budgeted {fmt(budgeted)}</span>
              <span style={{ color: T.ink }}>= Limit {fmt(limit)}</span>
            </div>
          )}
          <div style={{ margin: "12px 0 6px" }}><BudgetBar spentRatio={ratio} /></div>
          <div style={{ fontSize: 11.5, color: T.inkSoft }}>{fmt(spent)} spent so far</div>
          {note && <div style={{ fontSize: 11.5, color: noteColor || T.inkSoft, marginTop: 6 }}>{note}</div>}
        </>
      )}
    </Card>
  );
}

function ImportModal({ onClose, onImport }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setText(ev.target.result);
    reader.readAsText(file);
    e.target.value = "";
  };

  const runImport = () => {
    setError("");
    try {
      const parsed = JSON.parse(text);
      const keys = ["accounts", "transactions", "goals", "budgets", "scheduled"];
      const hasAny = keys.some((k) => Array.isArray(parsed[k]));
      if (!hasAny) throw new Error("This file doesn't look like a Passbook export — no recognized data found.");
      onImport(parsed);
    } catch (e) {
      setError(e.message || "Couldn't read that as valid JSON.");
    }
  };

  const showPreview = () => {
    setError("");
    try {
      const parsed = JSON.parse(text);
      setPreview({
        accounts: parsed.accounts?.length || 0,
        transactions: parsed.transactions?.length || 0,
        goals: parsed.goals?.length || 0,
        budgets: parsed.budgets?.length || 0,
        scheduled: parsed.scheduled?.length || 0,
      });
    } catch (e) {
      setError("Couldn't read that as valid JSON.");
      setPreview(null);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(30,42,34,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}>
      <div style={{ background: T.surface, borderRadius: 12, padding: "1.5rem", width: "100%", maxWidth: 460, border: `0.5px solid ${T.line}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: 18 }}>Import data</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: T.inkSoft }}><X size={16} /></button>
        </div>
        <div style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 14 }}>
          This replaces your current accounts, transactions, budgets, goals, and calendar items with what's in the file. Use this once, right after signing in with a fresh account.
        </div>

        <label className="btn secondary" style={{ cursor: "pointer", width: "100%", justifyContent: "center", marginBottom: 10 }}>
          <FileUp size={14} /> Choose exported .json file
          <input type="file" accept=".json,application/json" onChange={handleFile} style={{ display: "none" }} />
        </label>

        <textarea
          className="field" rows={5} placeholder="…or paste the exported JSON here"
          value={text} onChange={(e) => { setText(e.target.value); setPreview(null); }}
          style={{ width: "100%", fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, resize: "vertical" }}
        />

        {error && <div style={{ color: T.negative, fontSize: 12.5, marginTop: 8 }}>{error}</div>}

        {preview && !error && (
          <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 8 }}>
            Found {preview.accounts} accounts, {preview.transactions} transactions, {preview.goals} goals, {preview.budgets} budgets, {preview.scheduled} calendar items.
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button className="btn secondary" onClick={showPreview} disabled={!text.trim()}>Preview</button>
          <button className="btn" onClick={runImport} disabled={!text.trim()}>Import</button>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function BudgetBar({ spentRatio, scheduledRatio = 0 }) {
  const total = spentRatio + scheduledRatio;
  const color = total > 1 ? T.negative : total > 0.8 ? T.brass : T.positive;
  const spentPct = Math.min(100, spentRatio * 100);
  const totalPct = Math.min(100, total * 100);
  return (
    <div style={{ height: 7, background: T.line, borderRadius: 999, overflow: "hidden", position: "relative" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: spentPct + "%", height: "100%", background: color, transition: "width .3s ease" }} />
      <div style={{ position: "absolute", left: spentPct + "%", top: 0, width: Math.max(0, totalPct - spentPct) + "%", height: "100%", background: color, opacity: 0.4, transition: "width .3s ease" }} />
    </div>
  );
}

function StampRing({ pct, size = 64 }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={T.line} strokeWidth="5" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={T.brass} strokeWidth="5"
        strokeDasharray={c} strokeDashoffset={c - (clamped / 100) * c}
        strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.4s ease" }}
      />
      <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle"
        style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fill: T.ink, fontWeight: 500 }}>
        {Math.round(clamped)}%
      </text>
    </svg>
  );
}

/* ---------- App ---------- */
function PassbookApp({ session }) {
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [goals, setGoals] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [scheduled, setScheduled] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("dashboard");
  const [showImport, setShowImport] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    loadAll().then((d) => {
      setAccounts(d.accounts); setTransactions(d.transactions); setGoals(d.goals); setBudgets(d.budgets); setScheduled(d.scheduled);
      setLoading(false);
    });
  }, []);

  const updateAccounts = useCallback((next) => { setAccounts(next); save("accounts", next); }, []);
  const updateTransactions = useCallback((next) => { setTransactions(next); save("transactions", next); }, []);
  const updateGoals = useCallback((next) => { setGoals(next); save("goals", next); }, []);
  const updateBudgets = useCallback((next) => { setBudgets(next); save("budgets", next); }, []);
  const updateScheduled = useCallback((next) => { setScheduled(next); save("scheduled", next); }, []);

  const handleImport = (data) => {
    updateAccounts(data.accounts || []);
    updateTransactions(data.transactions || []);
    updateGoals(data.goals || []);
    updateBudgets(data.budgets || []);
    updateScheduled(data.scheduled || []);
    setShowImport(false);
  };

  const netWorth = useMemo(() => accounts.reduce((sum, a) => {
    const type = ACCOUNT_TYPES.find((t) => t.id === a.type);
    return sum + (type?.liability ? -Math.abs(a.balance) : a.balance);
  }, 0), [accounts]);

  const nav = [
    { id: "dashboard", label: "Dashboard", short: "Home", icon: LayoutDashboard },
    { id: "transactions", label: "Transactions", short: "Activity", icon: Receipt },
    { id: "budgets", label: "Budgets", short: "Budgets", icon: PiggyBank },
    { id: "calendar", label: "Calendar", short: "Calendar", icon: CalendarDays },
    { id: "plan", label: "Monthly plan", short: "Plan", icon: Calculator },
    { id: "accounts", label: "Accounts", short: "Accounts", icon: Wallet },
    { id: "goals", label: "Goals", short: "Goals", icon: Target },
  ];

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: T.paper, color: T.ink, minHeight: "100vh", width: "100%", display: "flex", flexDirection: isMobile ? "column" : "row" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        button { font-family: inherit; cursor: pointer; }
        input, select, textarea { font-family: inherit; font-size: 16px; }
        ::placeholder { color: #9C9788; }
        .navbtn { display:flex; align-items:center; gap:10px; width:100%; padding:9px 12px; border-radius:8px; border:none; background:transparent; color:${T.inkSoft}; font-size:13.5px; font-weight:500; text-align:left; transition: background .15s, color .15s; }
        .navbtn:hover { background: ${T.brassLight}; }
        .navbtn.active { background: ${T.ink}; color: ${T.paper}; }
        .field { border:1px solid ${T.line}; border-radius:8px; padding:8px 10px; font-size:13.5px; background:${T.surface}; color:${T.ink}; }
        @media (max-width: 700px) {
          .field { font-size: 16px; }
        }
        .field:focus { outline:2px solid ${T.brass}; outline-offset:1px; }
        .btn { border:1px solid ${T.ink}; background:${T.ink}; color:${T.paper}; border-radius:8px; padding:8px 14px; font-size:13px; font-weight:500; display:inline-flex; align-items:center; gap:6px; }
        .btn.secondary { background:transparent; color:${T.ink}; border:1px solid ${T.line}; }
        .btn:active { transform: scale(0.98); }
        .row:hover { background: ${T.brassLight}55; }
        .bottomnav-btn { flex: 1 0 auto; min-width: 60px; display:flex; flex-direction:column; align-items:center; gap:3px; padding:8px 4px 6px; background:none; border:none; color:${T.inkSoft}; font-size:9.5px; font-weight:500; }
        .bottomnav-btn.active { color: ${T.brass}; }
      `}</style>

      {!isMobile && (
        <div style={{ width: 190, borderRight: `0.5px solid ${T.line}`, padding: "1.25rem 0.85rem", display: "flex", flexDirection: "column", gap: 4, height: "100vh", position: "sticky", top: 0 }}>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: 20, fontWeight: 600, padding: "4px 8px 18px" }}>Passbook</div>
          {nav.map((n) => (
            <button key={n.id} className={`navbtn ${tab === n.id ? "active" : ""}`} onClick={() => setTab(n.id)}>
              <n.icon size={16} /> {n.label}
            </button>
          ))}
          <div style={{ marginTop: "auto", padding: "10px 8px", fontSize: 11, color: T.inkSoft, borderTop: `0.5px solid ${T.line}`, paddingTop: 14 }}>
            Net worth
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 17, color: T.ink, marginTop: 2 }}>{fmt(netWorth)}</div>
          </div>
          <div style={{ paddingTop: 10, borderTop: `0.5px solid ${T.line}` }}>
            <div style={{ fontSize: 10.5, color: T.inkSoft, padding: "0 8px 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={session?.user?.email}>
              {session?.user?.email}
            </div>
            <button className="navbtn" onClick={() => setShowImport(true)} style={{ color: T.inkSoft }}>
              <FileUp size={15} /> Import data
            </button>
            <button className="navbtn" onClick={() => supabase.auth.signOut()} style={{ color: T.inkSoft }}>
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </div>
      )}

      {isMobile && (
        <div style={{ position: "sticky", top: 0, zIndex: 20, background: T.paper, borderBottom: `0.5px solid ${T.line}`, padding: "0.8rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: 18, fontWeight: 600 }}>Passbook</div>
          <button onClick={() => setMenuOpen(true)} aria-label="Menu" style={{ background: "none", border: "none", color: T.ink, padding: 6 }}>
            <Menu size={20} />
          </button>
        </div>
      )}

      {isMobile && menuOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(30,42,34,0.45)", zIndex: 40 }} onClick={() => setMenuOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "min(78vw, 280px)", background: T.surface, padding: "1.25rem 1rem", boxShadow: "-4px 0 16px rgba(0,0,0,0.15)", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
              <button onClick={() => setMenuOpen(false)} style={{ background: "none", border: "none", color: T.inkSoft }} aria-label="Close menu"><X size={18} /></button>
            </div>
            <div style={{ fontSize: 11, color: T.inkSoft }}>Net worth</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 20, marginBottom: 18 }}>{fmt(netWorth)}</div>
            <div style={{ fontSize: 10.5, color: T.inkSoft, marginBottom: 10, wordBreak: "break-all" }} title={session?.user?.email}>
              {session?.user?.email}
            </div>
            <button className="navbtn" onClick={() => { setShowImport(true); setMenuOpen(false); }} style={{ color: T.inkSoft }}>
              <FileUp size={15} /> Import data
            </button>
            <button className="navbtn" onClick={() => supabase.auth.signOut()} style={{ color: T.inkSoft }}>
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </div>
      )}

      {showImport && <ImportModal onClose={() => setShowImport(false)} onImport={handleImport} />}

      <div style={{ flex: 1, padding: isMobile ? "1rem" : "1.5rem 1.75rem", overflowY: "auto", height: isMobile ? undefined : "100vh", paddingBottom: isMobile ? 88 : undefined }}>
        {loading ? (
          <div style={{ color: T.inkSoft, fontSize: 14 }}>Loading your ledger…</div>
        ) : tab === "dashboard" ? (
          <Dashboard accounts={accounts} transactions={transactions} goals={goals} budgets={budgets} scheduled={scheduled} netWorth={netWorth} setTab={setTab} />
        ) : tab === "transactions" ? (
          <TransactionsView accounts={accounts} transactions={transactions} setTransactions={updateTransactions} />
        ) : tab === "budgets" ? (
          <BudgetsView budgets={budgets} setBudgets={updateBudgets} transactions={transactions} scheduled={scheduled} />
        ) : tab === "calendar" ? (
          <CalendarView scheduled={scheduled} setScheduled={updateScheduled} accounts={accounts} />
        ) : tab === "plan" ? (
          <MonthlyPlanView scheduled={scheduled} budgets={budgets} setTab={setTab} />
        ) : tab === "accounts" ? (
          <AccountsView accounts={accounts} setAccounts={updateAccounts} />
        ) : (
          <GoalsView goals={goals} setGoals={updateGoals} accounts={accounts} />
        )}
      </div>

      {isMobile && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 20,
          background: T.surface, borderTop: `0.5px solid ${T.line}`,
          display: "flex", overflowX: "auto",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}>
          {nav.map((n) => (
            <button key={n.id} className={`bottomnav-btn ${tab === n.id ? "active" : ""}`} onClick={() => setTab(n.id)}>
              <n.icon size={18} />
              {n.short}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Auth gate ----------
   Wraps PassbookApp: shows the sign-in screen until there's a session,
   then mounts the app scoped to that user. The `key` forces a clean
   remount (and fresh data load) if a different user signs in in the
   same browser tab. */
export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (authLoading) {
    return (
      <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", padding: "4rem 1rem", textAlign: "center", color: "#5B6459" }}>
        Loading…
      </div>
    );
  }
  if (!session) return <Auth />;
  return <PassbookApp key={session.user.id} session={session} />;
}


/* ---------- Dashboard ---------- */
function Dashboard({ accounts, transactions, goals, budgets, scheduled, netWorth, setTab }) {
  const isMobile = useIsMobile();
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const daysInMonth = monthEndDate.getDate();

  const monthTx = transactions.filter((t) => monthKey(t.date) === thisMonth);
  const monthSpend = monthTx.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  const byCat = useMemo(() => {
    const m = {};
    monthTx.filter((t) => t.amount < 0).forEach((t) => { m[t.category] = (m[t.category] || 0) + Math.abs(t.amount); });
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [monthTx]);

  const plan = useMemo(() => computeMonthlyPlan(scheduled, monthStart, monthEndDate), [scheduled]);
  const monthlyBudgeted = useMemo(() => budgets.reduce((s, b) => s + budgetMonthlyEquivalent(b, daysInMonth), 0), [budgets]);
  const hasMonthData = plan.totalIncome > 0 || budgets.length > 0;
  const monthlyPool = plan.totalIncome - plan.totalBills - monthlyBudgeted;

  const smoothed = useMemo(() => computeWeeklySmoothedPlan(scheduled, monthStart, monthEndDate, monthlyPool), [scheduled, monthlyPool]);
  const weekSpend = spentFor(transactions, "Overall", "weekly");
  const hasWeekData = hasMonthData;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysElapsed = Math.min(daysInMonth, Math.round((today - monthStart) / 86400000) + 1);
  const targetSoFar = smoothed.dailyRate * daysElapsed;
  const actualSoFar = rangeTotals(scheduled, monthStart, today);
  const bufferSoFar = (actualSoFar.income - actualSoFar.bills) - targetSoFar;
  const bufferNote = Math.abs(bufferSoFar) < 1 ? null :
    bufferSoFar > 0
      ? `Running ${fmt(bufferSoFar)} ahead of pace — banked for a heavier week later this month.`
      : `Running ${fmt(Math.abs(bufferSoFar))} behind pace — bills have outpaced income so far this month.`;

  const recent = [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);

  const upcoming = useMemo(() => {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = addDays(start, 13);
    const items = [];
    scheduled.forEach((item) => {
      occurrencesInRange(item, start, end).forEach((d) => items.push({ ...item, occDate: d }));
    });
    return items.sort((a, b) => a.occDate - b.occDate).slice(0, 5);
  }, [scheduled]);

  return (
    <div>
      <div style={{ fontFamily: "Fraunces, serif", fontSize: 22, marginBottom: 4 }}>Your dashboard</div>
      <div style={{ color: T.inkSoft, fontSize: 13.5, marginBottom: 20 }}>{now.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 20 }}>
        <SpendingLimitCard
          title="Month spending limit"
          income={plan.totalIncome} bills={plan.totalBills} budgeted={monthlyBudgeted}
          subtitle={hasMonthData ? `≈ ${fmt(smoothed.weeklyTarget)}/week if spread evenly` : null}
          spent={monthSpend} hasData={hasMonthData}
          onManage={() => setTab("plan")} manageLabel="Monthly plan"
        />
        <SpendingLimitCard
          title="Week spending limit"
          limit={smoothed.weeklyTarget}
          subtitle={hasWeekData ? "Same every week — smoothed across the month so bigger bills don't create spikes." : null}
          spent={weekSpend} hasData={hasWeekData}
          note={bufferNote} noteColor={bufferSoFar > 0 ? T.positive : T.negative}
          onManage={() => setTab("plan")} manageLabel="Monthly plan"
        />
      </div>


      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.1fr 1fr", gap: 12, marginBottom: 20 }}>
        <Card>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Spending by category</div>
          {byCat.length === 0 ? (
            <Empty icon={Receipt} title="Nothing to show" body="This month's spending will appear here." />
          ) : (
            <div style={{ height: 190, display: "flex", alignItems: "center" }}>
              <ResponsiveContainer width="55%" height="100%">
                <PieChart>
                  <Pie data={byCat} dataKey="value" nameKey="name" innerRadius={40} outerRadius={65} paddingAngle={2}>
                    {byCat.map((e, i) => <Cell key={i} fill={CAT_COLOR[e.name] || T.inkSoft} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${T.line}` }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
                {byCat.slice(0, 5).map((e) => (
                  <div key={e.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, color: T.inkSoft }}>
                      <span style={{ width: 7, height: 7, borderRadius: 999, background: CAT_COLOR[e.name] }} /> {e.name}
                    </span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{fmt(e.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Budgets</div>
            <button onClick={() => setTab("budgets")} className="btn secondary" style={{ padding: "3px 8px", fontSize: 11 }}>Manage <ChevronRight size={12} /></button>
          </div>
          {budgets.length === 0 ? <Empty icon={PiggyBank} title="No budgets yet" body="Set a weekly, biweekly, or monthly limit." /> :
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {budgets.slice(0, 3).map((b) => {
                const spent = spentFor(transactions, b.category, b.period);
                const upcomingAmt = scheduledSpendFor(scheduled, b.category, b.period);
                return (
                  <div key={b.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                      <span>{b.category}</span>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>{fmt(spent)} / {fmt(b.amount)}</span>
                    </div>
                    <BudgetBar spentRatio={spent / b.amount} scheduledRatio={upcomingAmt / b.amount} />
                    {upcomingAmt > 0 && <div style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 3 }}>+ {fmt(upcomingAmt)} scheduled to come out</div>}
                  </div>
                );
              })}
            </div>
          }
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
        <Card>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Recent transactions</div>
          {recent.length === 0 ? <Empty icon={Receipt} title="No entries yet" body="Add your first transaction to start the ledger." /> :
            recent.map((t) => (
              <div key={t.id} className="row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 4px", borderBottom: `0.5px solid ${T.line}`, borderRadius: 6 }}>
                <div>
                  <div style={{ fontSize: 13 }}>{t.description}</div>
                  <div style={{ fontSize: 11, color: T.inkSoft, fontFamily: "'IBM Plex Mono', monospace" }}>{t.date} · {t.category}</div>
                </div>
                <Money value={t.amount} />
              </div>
            ))}
        </Card>
        <Card>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>Goal progress</div>
          {goals.length === 0 ? <Empty icon={Target} title="No goals yet" body="Set one up on the Goals tab." /> :
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {goals.slice(0, 3).map((g) => (
                <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <StampRing pct={(g.saved / g.target) * 100} size={40} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13 }}>{g.name}</div>
                    <div style={{ fontSize: 11, color: T.inkSoft, fontFamily: "'IBM Plex Mono', monospace" }}>{fmt(g.saved)} of {fmt(g.target)}</div>
                  </div>
                </div>
              ))}
            </div>
          }
        </Card>
      </div>

      <Card style={{ marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Upcoming income and bills, next 14 days</div>
          <button onClick={() => setTab("calendar")} className="btn secondary" style={{ padding: "3px 8px", fontSize: 11 }}>Calendar <ChevronRight size={12} /></button>
        </div>
        {upcoming.length === 0 ? <Empty icon={CalendarDays} title="Nothing scheduled" body="Add recurring income or bills on the Calendar tab." /> : (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(5, minmax(0,1fr))", gap: 10 }}>
            {upcoming.map((item, i) => (
              <div key={i} style={{ borderLeft: `2px solid ${item.amount >= 0 ? T.positive : T.negative}`, paddingLeft: 8 }}>
                <div style={{ fontSize: 10.5, color: T.inkSoft, fontFamily: "'IBM Plex Mono', monospace" }}>{toDateStr(item.occDate)}</div>
                <div style={{ fontSize: 12.5, marginTop: 1 }}>{item.name}</div>
                <Money value={item.amount} size={12.5} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------- Transactions ---------- */
function TransactionsView({ accounts, transactions, setTransactions }) {
  const isMobile = useIsMobile();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: todayStr(), account: "", description: "", category: "", amount: "", flow: "expense" });
  const [filterCat, setFilterCat] = useState("All");

  const addTx = () => {
    if (!form.description || !form.amount) return;
    const amt = Math.abs(parseFloat(form.amount)) * (form.flow === "expense" ? -1 : 1);
    const tx = { id: uid(), date: form.date, account: form.account || (accounts[0]?.name ?? "Unassigned"), description: form.description, category: form.category || "Other", amount: amt };
    setTransactions([tx, ...transactions]);
    setForm({ date: todayStr(), account: "", description: "", category: "", amount: "", flow: "expense" });
    setShowForm(false);
  };

  const removeTx = (id) => setTransactions(transactions.filter((t) => t.id !== id));

  const handleCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      Papa.parse(ev.target.result, {
        header: true, skipEmptyLines: true,
        complete: (res) => {
          const imported = res.data.map((row) => {
            const keys = Object.keys(row).reduce((o, k) => ({ ...o, [k.trim().toLowerCase()]: row[k] }), {});
            const desc = keys.description || keys.name || keys.memo || "Imported transaction";
            const amount = parseFloat(keys.amount || keys.value || 0);
            return {
              id: uid(),
              date: keys.date ? new Date(keys.date).toISOString().slice(0, 10) : todayStr(),
              account: accounts[0]?.name ?? "Unassigned",
              description: desc,
              category: guessCategory(desc) || "Other",
              amount: isNaN(amount) ? 0 : amount,
            };
          }).filter((t) => t.amount !== 0);
          setTransactions([...imported, ...transactions]);
        },
      });
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const filtered = filterCat === "All" ? transactions : transactions.filter((t) => t.category === filterCat);
  const sorted = [...filtered].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: 22 }}>Transactions</div>
          <div style={{ color: T.inkSoft, fontSize: 13.5 }}>{transactions.length} entries in the ledger</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <label className="btn secondary" style={{ cursor: "pointer" }}>
            <Upload size={14} /> Import CSV
            <input type="file" accept=".csv" onChange={handleCSV} style={{ display: "none" }} />
          </label>
          <button className="btn" onClick={() => setShowForm((s) => !s)}><Plus size={14} /> Add transaction</button>
        </div>
      </div>

      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(6, minmax(0,1fr))", gap: 8, alignItems: "end" }}>
            <div>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>Date</div>
              <input className="field" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={{ width: "100%" }} />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>Description</div>
              <input className="field" placeholder="Coffee, rent, paycheck…" value={form.description}
                onChange={(e) => { const v = e.target.value; setForm((f) => ({ ...f, description: v, category: f.category || guessCategory(v) })); }}
                style={{ width: "100%" }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>Category</div>
              <select className="field" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={{ width: "100%" }}>
                <option value="">Select…</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>Type</div>
              <select className="field" value={form.flow} onChange={(e) => setForm({ ...form, flow: e.target.value })} style={{ width: "100%" }}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>Amount</div>
              <input className="field" type="number" step="0.01" placeholder="0.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={{ width: "100%" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn" onClick={addTx}>Save entry</button>
            <button className="btn secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </Card>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {["All", ...CATEGORIES].map((c) => (
          <button key={c} onClick={() => setFilterCat(c)} className="btn secondary"
            style={{ padding: "4px 10px", fontSize: 12, background: filterCat === c ? T.ink : "transparent", color: filterCat === c ? T.paper : T.ink, borderColor: filterCat === c ? T.ink : T.line }}>
            {c}
          </button>
        ))}
      </div>

      <Card style={{ padding: 0 }}>
        {sorted.length === 0 ? <div style={{ padding: "1.5rem" }}><Empty icon={Receipt} title="Nothing here yet" body="Add an entry or import a CSV to populate your ledger." /></div> :
          sorted.map((t) => (
            <div key={t.id} className="row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: `0.5px solid ${T.line}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: T.inkSoft, width: 78 }}>{t.date}</div>
                <div>
                  <div style={{ fontSize: 13.5 }}>{t.description}</div>
                  <div style={{ marginTop: 2 }}><Pill text={t.category} color={CAT_COLOR[t.category] || T.inkSoft} /></div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <Money value={t.amount} />
                <button onClick={() => removeTx(t.id)} style={{ background: "none", border: "none", color: T.inkSoft }} aria-label="Delete transaction"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
      </Card>
    </div>
  );
}

/* ---------- Budgets ---------- */
function BudgetsView({ budgets, setBudgets, transactions, scheduled }) {
  const isMobile = useIsMobile();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ category: "Overall", period: "monthly", amount: "" });

  const addBudget = () => {
    if (!form.amount) return;
    const existing = budgets.find((b) => b.category === form.category && b.period === form.period);
    if (existing) {
      setBudgets(budgets.map((b) => b.id === existing.id ? { ...b, amount: parseFloat(form.amount) } : b));
    } else {
      setBudgets([...budgets, { id: uid(), category: form.category, period: form.period, amount: parseFloat(form.amount) }]);
    }
    setForm({ category: "Overall", period: "monthly", amount: "" });
    setShowForm(false);
  };
  const removeBudget = (id) => setBudgets(budgets.filter((b) => b.id !== id));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: 22 }}>Budgets</div>
          <div style={{ color: T.inkSoft, fontSize: 13.5 }}>Set weekly, biweekly, or monthly spending limits, overall or by category.</div>
        </div>
        <button className="btn" onClick={() => setShowForm((s) => !s)}><Plus size={14} /> New budget</button>
      </div>

      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.4fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
            <div>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>Category</div>
              <select className="field" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={{ width: "100%" }}>
                <option value="Overall">Overall spending</option>
                {CATEGORIES.filter((c) => c !== "Income").map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>Period</div>
              <select className="field" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} style={{ width: "100%" }}>
                {BUDGET_PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>Limit</div>
              <input className="field" type="number" step="0.01" placeholder="0.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={{ width: "100%" }} />
            </div>
            <button className="btn" onClick={addBudget}>Save</button>
          </div>
          <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 8 }}>Setting a budget for a category and period that already exists will update its limit.</div>
        </Card>
      )}

      {budgets.length === 0 ? <Empty icon={PiggyBank} title="No budgets set" body="Add a budget to start tracking against a spending limit." /> : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0,1fr))", gap: 12 }}>
          {BUDGET_PERIODS.map((p) => {
            const group = budgets.filter((b) => b.period === p.id);
            if (group.length === 0) return null;
            return (
              <div key={p.id} style={{ gridColumn: "span 1" }}>
                <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, color: T.inkSoft }}>{p.label} · {p.sub}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {group.map((b) => {
                    const spent = spentFor(transactions, b.category, b.period);
                    const upcomingAmt = scheduledSpendFor(scheduled, b.category, b.period);
                    const remaining = b.amount - spent - upcomingAmt;
                    const over = remaining < 0;
                    return (
                      <Card key={b.id}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div style={{ fontSize: 13.5, fontWeight: 500 }}>{b.category}</div>
                          <button onClick={() => removeBudget(b.id)} style={{ background: "none", border: "none", color: T.inkSoft }} aria-label="Remove budget"><Trash2 size={13} /></button>
                        </div>
                        <div style={{ margin: "8px 0 6px" }}><BudgetBar spentRatio={spent / b.amount} scheduledRatio={upcomingAmt / b.amount} /></div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
                          <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkSoft }}>{fmt(spent)} of {fmt(b.amount)}</span>
                          <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: over ? T.negative : T.positive, fontWeight: 500 }}>
                            {over ? `${fmt(Math.abs(remaining))} over` : `${fmt(remaining)} left`}
                          </span>
                        </div>
                        {upcomingAmt > 0 && <div style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 4 }}>includes {fmt(upcomingAmt)} not yet pulled</div>}
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- Calendar ---------- */
function CalendarView({ scheduled, setScheduled, accounts }) {
  const isMobile = useIsMobile();
  const [monthCursor, setMonthCursor] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [selected, setSelected] = useState(toDateStr(new Date()));
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", flow: "expense", amount: "", category: "Other", account: "", frequency: "monthly", startDate: todayStr() });

  const addItem = () => {
    if (!form.name || !form.amount || !form.startDate) return;
    const amt = Math.abs(parseFloat(form.amount)) * (form.flow === "expense" ? -1 : 1);
    setScheduled([...scheduled, {
      id: uid(), name: form.name, amount: amt,
      category: form.flow === "expense" ? form.category : "Income",
      account: form.account || (accounts[0]?.name ?? "Unassigned"),
      frequency: form.frequency, startDate: form.startDate,
    }]);
    setForm({ name: "", flow: "expense", amount: "", category: "Other", account: "", frequency: "monthly", startDate: todayStr() });
    setShowForm(false);
  };
  const removeItem = (id) => setScheduled(scheduled.filter((s) => s.id !== id));

  const monthStart = monthCursor;
  const monthEnd = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
  const dayMap = useMemo(() => {
    const map = {};
    scheduled.forEach((item) => {
      occurrencesInRange(item, monthStart, monthEnd).forEach((d) => {
        const key = toDateStr(d);
        if (!map[key]) map[key] = { income: 0, expense: 0, items: [] };
        if (item.amount >= 0) map[key].income += item.amount; else map[key].expense += Math.abs(item.amount);
        map[key].items.push(item);
      });
    });
    return map;
  }, [scheduled, monthCursor]);

  const firstWeekday = monthStart.getDay();
  const daysInMonth = monthEnd.getDate();
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), d));

  const selectedDayItems = dayMap[selected]?.items ?? [];

  const cashAccounts = accounts.filter((a) => a.type === "checking" || a.type === "savings");
  const cashBalance = cashAccounts.reduce((s, a) => s + a.balance, 0);

  const projection = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = addDays(start, 29);
    const byDay = {};
    scheduled.forEach((item) => {
      occurrencesInRange(item, start, end).forEach((d) => {
        const key = toDateStr(d);
        byDay[key] = (byDay[key] || 0) + item.amount;
      });
    });
    let running = cashBalance;
    const arr = [];
    for (let i = 0; i <= 29; i++) {
      const d = addDays(start, i);
      const key = toDateStr(d);
      running += byDay[key] || 0;
      arr.push({ label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), balance: Math.round(running) });
    }
    return arr;
  }, [scheduled, cashBalance]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: 22 }}>Accounts calendar</div>
          <div style={{ color: T.inkSoft, fontSize: 13.5 }}>Recurring income and bills, so your budget knows what's coming.</div>
        </div>
        <button className="btn" onClick={() => setShowForm((s) => !s)}><Plus size={14} /> Add recurring item</button>
      </div>

      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.4fr 1fr 1fr 1fr 1fr", gap: 8, alignItems: "end" }}>
            <div>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>Name</div>
              <input className="field" placeholder="Paycheck, rent, Netflix…" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ width: "100%" }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>Type</div>
              <select className="field" value={form.flow} onChange={(e) => setForm({ ...form, flow: e.target.value })} style={{ width: "100%" }}>
                <option value="expense">Auto-pulled expense</option>
                <option value="income">Income deposit</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>Amount</div>
              <input className="field" type="number" step="0.01" placeholder="0.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={{ width: "100%" }} />
            </div>
            {form.flow === "expense" && (
              <div>
                <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>Category</div>
                <select className="field" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={{ width: "100%" }}>
                  {CATEGORIES.filter((c) => c !== "Income").map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
            <div>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>Repeats</div>
              <select className="field" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} style={{ width: "100%" }}>
                {FREQUENCIES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr auto", gap: 8, marginTop: 8, alignItems: "end" }}>
            <div>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>Account</div>
              <select className="field" value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })} style={{ width: "100%" }}>
                <option value="">Select…</option>
                {accounts.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>First occurs</div>
              <input className="field" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} style={{ width: "100%" }} />
            </div>
            <button className="btn" onClick={addItem}>Save</button>
          </div>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.5fr 1fr", gap: 12 }}>
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <button className="btn secondary" style={{ padding: "4px 9px" }} onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}>‹</button>
            <div style={{ fontFamily: "Fraunces, serif", fontSize: 15 }}>{monthCursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div>
            <button className="btn secondary" style={{ padding: "4px 9px" }} onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}>›</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, marginBottom: 4 }}>
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} style={{ textAlign: "center", fontSize: 10.5, color: T.inkSoft, padding: "2px 0" }}>{d}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const key = toDateStr(d);
              const info = dayMap[key];
              const isSelected = key === selected;
              const isToday = key === toDateStr(new Date());
              return (
                <button key={i} onClick={() => setSelected(key)} style={{
                  aspectRatio: "1", border: `1px solid ${isSelected ? T.brass : T.line}`, borderRadius: 7,
                  background: isSelected ? T.brassLight : T.surface, padding: 4, display: "flex", flexDirection: "column",
                  alignItems: "flex-start", justifyContent: "flex-start", gap: 2,
                }}>
                  <span style={{ fontSize: 11, color: isToday ? T.brass : T.ink, fontWeight: isToday ? 600 : 400 }}>{d.getDate()}</span>
                  <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                    {info?.income > 0 && <span style={{ width: 5, height: 5, borderRadius: 999, background: T.positive }} />}
                    {info?.expense > 0 && <span style={{ width: 5, height: 5, borderRadius: 999, background: T.negative }} />}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>{selected}</div>
          {selectedDayItems.length === 0 ? <Empty icon={CalendarDays} title="Nothing scheduled" body="No income or bills land on this day." /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {selectedDayItems.map((item) => (
                <div key={item.id} className="row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 4px", borderRadius: 6 }}>
                  <div>
                    <div style={{ fontSize: 12.5 }}>{item.name}</div>
                    <div style={{ fontSize: 10.5, color: T.inkSoft }}>{item.account} · {FREQUENCIES.find((f) => f.id === item.frequency)?.label}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Money value={item.amount} size={12.5} />
                    <button onClick={() => removeItem(item.id)} style={{ background: "none", border: "none", color: T.inkSoft }} aria-label="Delete recurring item"><Trash2 size={12} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card style={{ marginTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Projected checking + savings balance, next 30 days</div>
        <div style={{ fontSize: 11.5, color: T.inkSoft, marginBottom: 8 }}>
          Starting from {fmt(cashBalance)} across {cashAccounts.length || 0} cash account{cashAccounts.length === 1 ? "" : "s"}, projected using your scheduled items above.
        </div>
        {cashAccounts.length === 0 ? <Empty icon={Wallet} title="No checking or savings accounts" body="Add one on the Accounts tab to see a projection." /> : (
          <div style={{ height: 170 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={projection}>
                <CartesianGrid stroke={T.line} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: T.inkSoft }} axisLine={{ stroke: T.line }} tickLine={false} interval={4} />
                <YAxis tick={{ fontSize: 10, fill: T.inkSoft }} axisLine={false} tickLine={false} width={50} />
                <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${T.line}` }} />
                <Line type="monotone" dataKey="balance" stroke={T.brass} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------- Monthly plan ---------- */
function MonthlyPlanView({ scheduled, budgets, setTab }) {
  const isMobile = useIsMobile();
  const [monthCursor, setMonthCursor] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const monthEnd = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
  const daysInMonth = monthEnd.getDate();

  const plan = useMemo(() => computeMonthlyPlan(scheduled, monthCursor, monthEnd), [scheduled, monthCursor]);
  const monthlyBudgeted = useMemo(() => budgets.reduce((s, b) => s + budgetMonthlyEquivalent(b, daysInMonth), 0), [budgets, daysInMonth]);
  const leftover = plan.totalIncome - plan.totalBills;
  const pool = leftover - monthlyBudgeted;
  const smoothed = useMemo(() => computeWeeklySmoothedPlan(scheduled, monthCursor, monthEnd, pool), [scheduled, monthCursor, pool]);
  const hasIncome = plan.incomeOccurrences.length > 0;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: 22 }}>Monthly plan</div>
          <div style={{ color: T.inkSoft, fontSize: 13.5 }}>How much to set aside from each paycheck to cover this month's bills.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button className="btn secondary" style={{ padding: "4px 9px" }} onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}>‹</button>
          <div style={{ fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", minWidth: 130, textAlign: "center" }}>{monthCursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div>
          <button className="btn secondary" style={{ padding: "4px 9px" }} onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}>›</button>
        </div>
      </div>

      {!hasIncome ? (
        <Card>
          <Empty icon={Calculator} title="No income scheduled this month" body="Add your paychecks or other income deposits on the Calendar tab, plus your recurring bills, and this plan builds itself." />
          <div style={{ textAlign: "center", marginTop: 8 }}>
            <button className="btn secondary" onClick={() => setTab("calendar")}>Go to Calendar</button>
          </div>
        </Card>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0,1fr))", gap: 12, marginBottom: 20 }}>
            <Card>
              <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}><TrendingUp size={13} /> Total income</div>
              <Money value={plan.totalIncome} size={20} />
            </Card>
            <Card>
              <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}><TrendingDown size={13} /> Total bills</div>
              <Money value={-plan.totalBills} size={20} />
            </Card>
            <Card>
              <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 6 }}>Left after bills</div>
              <Money value={leftover} size={20} />
            </Card>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Weekly spending limit</div>
            <div style={{ fontSize: 11.5, color: T.inkSoft }}>smoothed evenly across the month, budgets included</div>
          </div>
          <Card style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
              <div style={{ fontFamily: "Fraunces, serif", fontSize: 26 }}>{fmt(smoothed.weeklyTarget)}</div>
              <div style={{ fontSize: 12, color: T.inkSoft }}>every week, same number</div>
            </div>
            <div style={{ fontSize: 11.5, color: T.inkSoft }}>
              Weeks with more income than bills bank the extra as a buffer; weeks with heavier bills draw it back down — so this number stays flat all month.
            </div>
          </Card>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
            {smoothed.weeks.map((w, i) => {
              const over = w.bufferAfter < -0.5;
              return (
                <Card key={i}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{toDateStr(w.start)} – {toDateStr(w.end)}</div>
                    <div style={{ fontSize: 11.5, color: T.inkSoft }}>{w.days} day{w.days === 1 ? "" : "s"}</div>
                  </div>
                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11.5, color: T.inkSoft, marginTop: 6, fontFamily: "'IBM Plex Mono', monospace" }}>
                    <span>Income {fmt(w.income)}</span>
                    <span>Bills {fmt(w.bills)}</span>
                    <span style={{ color: T.ink }}>Net {fmt(w.net)}</span>
                    <span>Target {fmt(w.target)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                    <span style={{ fontSize: 12 }}>Running buffer</span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 500, color: over ? T.negative : T.positive }}>
                      {w.bufferAfter >= 0 ? "+" : "−"}{fmt(Math.abs(w.bufferAfter))}
                    </span>
                  </div>
                  {over && <div style={{ fontSize: 11, color: T.negative, marginTop: 4 }}>Bills are running ahead of income by this point — lean on savings or spend less in prior weeks.</div>}
                </Card>
              );
            })}
          </div>

          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>Set aside from each income source</div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0,1fr))", gap: 12, marginBottom: 24 }}>
            {plan.sources.map((s) => (
              <Card key={s.name}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: T.inkSoft }}>{s.occurrences} deposit{s.occurrences === 1 ? "" : "s"} this month · {fmt(s.total)} total</div>
                  </div>
                  <div style={{ fontSize: 11, color: T.inkSoft }}>{Math.round(s.share * 100)}% of income</div>
                </div>
                <div style={{ margin: "10px 0 6px" }}><BudgetBar spentRatio={s.total > 0 ? s.billShare / s.total : 0} /></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                  <span>Set aside for bills</span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.brass, fontWeight: 500 }}>{fmt(s.billShare)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginTop: 2 }}>
                  <span>Free to spend or save</span>
                  <Money value={s.leftover} size={12.5} />
                </div>
              </Card>
            ))}
          </div>

          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>Paycheck by paycheck</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {plan.carried.bills.length > 0 && (
              <Card style={{ borderLeft: `3px solid ${T.negative}` }}>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: T.negative }}>Due before your first paycheck this month</div>
                <div style={{ fontSize: 11.5, color: T.inkSoft, marginBottom: 8 }}>Make sure last month's leftover covers these.</div>
                {plan.carried.bills.map((b, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
                    <span>{toDateStr(b.date)} · {b.name}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{fmt(b.amount)}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 500, marginTop: 6, borderTop: `0.5px solid ${T.line}`, paddingTop: 6 }}>
                  <span>Total</span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{fmt(plan.carried.billTotal)}</span>
                </div>
              </Card>
            )}
            {plan.buckets.map((b, i) => {
              const rem = b.amount - b.billTotal;
              return (
                <Card key={i}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 500 }}>{toDateStr(b.date)} · {b.name}</div>
                      <div style={{ fontSize: 11, color: T.inkSoft }}>{b.bills.length} bill{b.bills.length === 1 ? "" : "s"} due before the next deposit</div>
                    </div>
                    <Money value={b.amount} size={16} />
                  </div>
                  {b.bills.length > 0 && (
                    <div style={{ margin: "10px 0", borderTop: `0.5px solid ${T.line}`, borderBottom: `0.5px solid ${T.line}`, padding: "8px 0" }}>
                      {b.bills.map((bill, j) => (
                        <div key={j} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "2px 0" }}>
                          <span style={{ color: T.inkSoft }}>{toDateStr(bill.date)} · {bill.name}</span>
                          <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{fmt(bill.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                    <span>Set aside for bills</span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.brass, fontWeight: 500 }}>{fmt(b.billTotal)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginTop: 2 }}>
                    <span>Free after bills</span>
                    <Money value={rem} size={12.5} />
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Accounts ---------- */
function AccountsView({ accounts, setAccounts }) {
  const isMobile = useIsMobile();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", type: "checking", balance: "" });

  const addAccount = () => {
    if (!form.name || form.balance === "") return;
    setAccounts([...accounts, { id: uid(), name: form.name, type: form.type, balance: parseFloat(form.balance) }]);
    setForm({ name: "", type: "checking", balance: "" });
    setShowForm(false);
  };
  const removeAccount = (id) => setAccounts(accounts.filter((a) => a.id !== id));
  const updateBalance = (id, val) => setAccounts(accounts.map((a) => a.id === id ? { ...a, balance: parseFloat(val) || 0 } : a));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: 22 }}>Accounts</div>
          <div style={{ color: T.inkSoft, fontSize: 13.5 }}>Enter balances manually for now — bank sync comes later.</div>
        </div>
        <button className="btn" onClick={() => setShowForm((s) => !s)}><Plus size={14} /> Add account</button>
      </div>

      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1.3fr 1fr auto", gap: 8, alignItems: "end" }}>
            <div>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>Account name</div>
              <input className="field" placeholder="Chase Checking" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ width: "100%" }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>Type</div>
              <select className="field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={{ width: "100%" }}>
                {ACCOUNT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>Balance</div>
              <input className="field" type="number" step="0.01" placeholder="0.00" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} style={{ width: "100%" }} />
            </div>
            <button className="btn" onClick={addAccount}>Add</button>
          </div>
        </Card>
      )}

      {accounts.length === 0 ? <Empty icon={Wallet} title="No accounts yet" body="Add checking, savings, or credit accounts to track your net worth." /> : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0,1fr))", gap: 12 }}>
          {accounts.map((a) => {
            const type = ACCOUNT_TYPES.find((t) => t.id === a.type);
            return (
              <Card key={a.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{a.name}</div>
                    <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 2 }}>{type?.label}{type?.liability ? " · liability" : ""}</div>
                  </div>
                  <button onClick={() => removeAccount(a.id)} style={{ background: "none", border: "none", color: T.inkSoft }} aria-label="Remove account"><Trash2 size={14} /></button>
                </div>
                <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, color: T.inkSoft }}>$</span>
                  <input className="field" type="number" step="0.01" value={a.balance}
                    onChange={(e) => updateBalance(a.id, e.target.value)}
                    style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 18, fontWeight: 500, border: "none", background: "transparent", padding: "2px 0", width: "100%" }} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- Goals ---------- */
function monthsUntil(dateStr) {
  const target = parseDateStr(dateStr);
  const now = new Date();
  let months = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
  return Math.max(1, months);
}

function GoalsView({ goals, setGoals }) {
  const isMobile = useIsMobile();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", target: "", saved: "", deadline: "" });

  const addGoal = () => {
    if (!form.name || !form.target || !form.deadline) return;
    setGoals([...goals, { id: uid(), name: form.name, target: parseFloat(form.target), saved: parseFloat(form.saved) || 0, deadline: form.deadline }]);
    setForm({ name: "", target: "", saved: "", deadline: "" });
    setShowForm(false);
  };
  const removeGoal = (id) => setGoals(goals.filter((g) => g.id !== id));
  const updateSaved = (id, val) => setGoals(goals.map((g) => g.id === id ? { ...g, saved: parseFloat(val) || 0 } : g));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: 22 }}>Savings goals</div>
          <div style={{ color: T.inkSoft, fontSize: 13.5 }}>Trips, gifts, renovations, tuition — whatever you're saving toward.</div>
        </div>
        <button className="btn" onClick={() => setShowForm((s) => !s)}><Plus size={14} /> New goal</button>
      </div>

      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
            <div>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>Goal name</div>
              <input className="field" placeholder="Trip to Japan" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ width: "100%" }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>Target amount</div>
              <input className="field" type="number" placeholder="4000" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} style={{ width: "100%" }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>Already saved</div>
              <input className="field" type="number" placeholder="0" value={form.saved} onChange={(e) => setForm({ ...form, saved: e.target.value })} style={{ width: "100%" }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>Target date</div>
              <input className="field" type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} style={{ width: "100%" }} />
            </div>
            <button className="btn" onClick={addGoal}>Add</button>
          </div>
        </Card>
      )}

      {goals.length === 0 ? <Empty icon={Target} title="No goals set" body="Create a goal to see how much to save each month." /> : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0,1fr))", gap: 12 }}>
          {goals.map((g) => {
            const remaining = Math.max(0, g.target - g.saved);
            const months = monthsUntil(g.deadline);
            const monthly = remaining / months;
            const pct = (g.saved / g.target) * 100;
            return (
              <Card key={g.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <StampRing pct={pct} />
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 500 }}>{g.name}</div>
                      <div style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: "'IBM Plex Mono', monospace" }}>by {g.deadline}</div>
                    </div>
                  </div>
                  <button onClick={() => removeGoal(g.id)} style={{ background: "none", border: "none", color: T.inkSoft }} aria-label="Remove goal"><Trash2 size={14} /></button>
                </div>
                <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 11, color: T.inkSoft }}>Saved</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 13 }}>$</span>
                      <input className="field" type="number" value={g.saved} onChange={(e) => updateSaved(g.id, e.target.value)}
                        style={{ width: 90, fontFamily: "'IBM Plex Mono', monospace", border: "none", background: "transparent", padding: "2px 0" }} />
                      <span style={{ fontSize: 12, color: T.inkSoft }}>of {fmt(g.target)}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: T.inkSoft }}>Save monthly to hit goal</div>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 16, color: T.brass, fontWeight: 500 }}>{fmt(monthly)}</div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
