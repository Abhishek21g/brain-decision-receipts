/** Shared config — benchmark bar: https://trust-me-bro-mu.vercel.app/ */
window.BR = window.BR || {};

BR.THRESHOLD_MODES = [
  { id: "strict", label: "Strict", threshold: 0.9 },
  { id: "standard", label: "Standard", threshold: 0.85 },
  { id: "lenient", label: "Lenient", threshold: 0.8 },
];

BR.SCENARIOS = [
  {
    id: "permit-auto-approve",
    file: "permit-auto-approve.json",
    title: "Permit · Auto Approve",
    shortTitle: "Auto Approve",
    slug: "permit-auto-approve",
    domain: "permit",
    files: 2,
    rules: 1,
    canaries: 0,
    description:
      "High-confidence blueprint extraction and zoning checks — R-12 fires for small R1 residential. Full automation path with clean doctor.",
    insight:
      "All value and check nodes above 0.85 — R-12 fires for small R1 residential. Full automation path.",
    difficulty: 0.12,
    automationByMode: { strict: 0.91, standard: 0.91, lenient: 0.91 },
    decision: "auto_approve",
    stageScores: { extract: 0.92, score: 0.91, rules: 0.91, decision: 0.91 },
    documents: ["blueprint-page-1.pdf", "permit-application.pdf"],
  },
  {
    id: "permit-human-review",
    file: "permit-human-review.json",
    title: "Permit · Human Review",
    shortTitle: "Human Review",
    slug: "permit-human-review",
    domain: "permit",
    files: 2,
    rules: 1,
    canaries: 1,
    description:
      "window_count_per_bedroom confidence drops to 0.62 — R-18 routes to reviewer. Application confidence falls below automation threshold.",
    insight:
      "window_count_per_bedroom confidence 0.62 — R-18 fires. Application confidence drops below threshold.",
    difficulty: 0.58,
    automationByMode: { strict: 0.62, standard: 0.68, lenient: 0.74 },
    decision: "human_review",
    stageScores: { extract: 0.78, score: 0.62, rules: 0.68, decision: 0.68 },
    documents: ["blueprint-page-1.pdf", "permit-application.pdf"],
  },
  {
    id: "claim-rules-mismatch",
    file: "claim-rules-mismatch.json",
    title: "Claim · Reject + Drift",
    shortTitle: "Rules Drift",
    slug: "claim-rules-mismatch",
    domain: "claim",
    files: 3,
    rules: 2,
    canaries: 2,
    description:
      "Rules bundle 2025.12 vs expected 2026.01. C-11 pre-existing exclusion fires — doctor flags version drift as critical.",
    insight:
      "Rules bundle 2025.12 vs expected 2026.01. C-11 pre-existing exclusion → reject.",
    difficulty: 0.84,
    automationByMode: { strict: 0.41, standard: 0.48, lenient: 0.55 },
    decision: "reject",
    stageScores: { extract: 0.72, score: 0.55, rules: 0.48, decision: 0.41 },
    documents: ["policy-section-4.pdf", "claim-form.pdf", "medical-note.pdf"],
  },
];

BR.initTheme = function initTheme() {
  const stored = localStorage.getItem("br-theme");
  const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
  const theme = stored || (prefersLight ? "light" : "dark");
  document.documentElement.setAttribute("data-theme", theme);
  return theme;
};

BR.toggleTheme = function toggleTheme() {
  const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("br-theme", next);
  document.querySelectorAll("[data-theme-label]").forEach((el) => {
    el.textContent = next === "light" ? "Switch to dark theme" : "Switch to light theme";
  });
  window.dispatchEvent(new CustomEvent("br-theme-change", { detail: next }));
};

BR.activeMode = function activeMode() {
  return document.querySelector(".mode-tab.active")?.dataset.mode || "standard";
};

BR.thresholdForMode = function thresholdForMode(mode) {
  return BR.THRESHOLD_MODES.find((m) => m.id === mode)?.threshold ?? 0.85;
};

BR.dataUrl = function dataUrl(file) {
  const base = window.location.pathname.replace(/\/[^/]*$/, "/");
  return `${base}data/${file}`;
};

BR.loadReceipt = async function loadReceipt(file) {
  try {
    const res = await fetch(BR.dataUrl(file), { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    if (window.EMBEDDED_DEMOS?.[file]) return window.EMBEDDED_DEMOS[file];
    throw new Error(`Could not load ${file}`);
  }
};

BR.fmt = function fmt(v, d = 3) {
  return v == null ? "—" : Number(v).toFixed(d);
};

BR.decisionClass = function decisionClass(d) {
  if (d === "auto_approve") return "good";
  if (d === "reject") return "bad";
  return "warn";
};

BR.initNav = function initNav(active) {
  document.querySelectorAll(".site-nav a[data-page]").forEach((a) => {
    a.classList.toggle("active", a.dataset.page === active);
  });
  const btn = document.getElementById("themeToggle");
  if (btn && !btn.dataset.bound) {
    btn.dataset.bound = "1";
    btn.addEventListener("click", BR.toggleTheme);
    const theme = BR.initTheme();
    btn.setAttribute("aria-label", theme === "light" ? "Switch to dark theme" : "Switch to light theme");
  } else {
    BR.initTheme();
  }
};

BR.bindModeTabs = function bindModeTabs(onChange) {
  document.querySelectorAll(".mode-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".mode-tab").forEach((t) => {
        t.classList.toggle("active", t === tab);
        t.setAttribute("aria-selected", t === tab ? "true" : "false");
      });
      onChange?.(tab.dataset.mode);
    });
  });
};

document.addEventListener("DOMContentLoaded", () => BR.initTheme());
