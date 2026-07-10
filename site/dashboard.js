let charts = {};

function chartColors() {
  const style = getComputedStyle(document.documentElement);
  return {
    text: style.getPropertyValue("--text-muted").trim() || "#8b97ad",
    grid: style.getPropertyValue("--chart-grid").trim() || "#222a38",
    accent: style.getPropertyValue("--accent").trim() || "#5b9cff",
    good: style.getPropertyValue("--good").trim() || "#3dd68c",
    warn: style.getPropertyValue("--warn").trim() || "#f0b429",
    bad: style.getPropertyValue("--bad").trim() || "#ff6b7a",
  };
}

function scoreForScenario(s, mode) {
  const conf = s.automationByMode[mode];
  const threshold = BR.thresholdForMode(mode);
  return conf >= threshold ? conf : conf * 0.85;
}

function decisionForScenario(s, mode) {
  const conf = s.automationByMode[mode];
  const threshold = BR.thresholdForMode(mode);
  if (conf >= threshold && s.decision === "auto_approve") return "auto_approve";
  if (s.decision === "reject") return "reject";
  if (conf < threshold) return "human_review";
  return s.decision;
}

function heatColor(value) {
  if (value >= 0.85) return { bg: "rgba(61,214,140,0.35)", border: "rgba(61,214,140,0.5)" };
  if (value >= 0.7) return { bg: "rgba(240,180,41,0.35)", border: "rgba(240,180,41,0.5)" };
  return { bg: "rgba(255,107,122,0.35)", border: "rgba(255,107,122,0.5)" };
}

function renderScoreChart(mode) {
  const c = chartColors();
  const labels = BR.SCENARIOS.map((s) => s.shortTitle);
  const data = BR.SCENARIOS.map((s) => scoreForScenario(s, mode));
  const colors = BR.SCENARIOS.map((s) => {
    const d = decisionForScenario(s, mode);
    if (d === "auto_approve") return c.good;
    if (d === "reject") return c.bad;
    return c.warn;
  });
  if (charts.score) charts.score.destroy();
  charts.score = new Chart(document.getElementById("scoreChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderRadius: 6 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { min: 0, max: 1, ticks: { color: c.text }, grid: { color: c.grid } },
        x: { ticks: { color: c.text }, grid: { display: false } },
      },
    },
  });
}

function renderRobustnessChart() {
  const c = chartColors();
  const labels = BR.THRESHOLD_MODES.map((m) => m.label);
  const datasets = BR.SCENARIOS.map((s, i) => ({
    label: s.shortTitle,
    data: BR.THRESHOLD_MODES.map((m) => s.automationByMode[m.id]),
    borderColor: [c.accent, c.warn, c.bad][i % 3],
    backgroundColor: "transparent",
    tension: 0.35,
    pointRadius: 4,
  }));
  if (charts.robustness) charts.robustness.destroy();
  charts.robustness = new Chart(document.getElementById("robustnessChart"), {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: c.text, boxWidth: 12 } } },
      scales: {
        y: { min: 0.3, max: 1, ticks: { color: c.text }, grid: { color: c.grid } },
        x: { ticks: { color: c.text }, grid: { color: c.grid } },
      },
    },
  });
}

function renderHeatmap(mode) {
  const el = document.getElementById("heatmap");
  const stages = ["extract", "score", "rules"];
  let html = `<div class="heatmap-header"><span>Scenario</span>${stages.map((s) => `<span>${s}</span>`).join("")}</div>`;
  for (const s of BR.SCENARIOS) {
    html += `<div class="heatmap-row"><span class="heatmap-label">${s.shortTitle}</span>`;
    for (const stage of stages) {
      const v = s.stageScores[stage];
      const col = heatColor(v);
      html += `<span class="heatmap-cell" style="background:${col.bg};border-color:${col.border}">${BR.fmt(v, 2)}</span>`;
    }
    html += `</div>`;
  }
  el.innerHTML = html;
}

function renderDifficulty() {
  const sorted = [...BR.SCENARIOS].sort((a, b) => b.difficulty - a.difficulty);
  document.getElementById("difficultyRank").innerHTML = sorted
    .map(
      (s, i) => `<li class="rank-item">
        <span class="rank-num">${i + 1}.</span>
        <span class="rank-name">${s.title}</span>
        <span class="rank-pct">${Math.round(s.difficulty * 100)}%</span>
        <div class="rank-bar-wrap"><div class="rank-bar" style="width:${Math.round(s.difficulty * 100)}%"></div></div>
      </li>`
    )
    .join("");
}

function renderOutcomeChart(mode) {
  const c = chartColors();
  const counts = { auto_approve: 0, human_review: 0, reject: 0 };
  BR.SCENARIOS.forEach((s) => {
    counts[decisionForScenario(s, mode)] += 1;
  });
  if (charts.outcome) charts.outcome.destroy();
  charts.outcome = new Chart(document.getElementById("outcomeChart"), {
    type: "doughnut",
    data: {
      labels: ["Auto approve", "Human review", "Reject"],
      datasets: [
        {
          data: [counts.auto_approve, counts.human_review, counts.reject],
          backgroundColor: [c.good, c.warn, c.bad],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { color: c.text, boxWidth: 12 } } },
    },
  });
}

function renderLibrary() {
  document.getElementById("scenarioLibrary").innerHTML = BR.SCENARIOS.map((s) => {
    const badge =
      s.decision === "auto_approve"
        ? "badge-good"
        : s.decision === "reject"
          ? "badge-bad"
          : "badge-warn";
    return `<a class="scenario-card" href="./runner.html?scenario=${s.slug}">
      <h3>${s.title}</h3>
      <div class="scenario-meta">
        <span>${s.files} files</span>
        <span>·</span>
        <span>${s.rules} rules</span>
        <span>·</span>
        <span>${s.canaries} doctor flags</span>
        <span class="badge ${badge}">${s.decision.replace("_", " ")}</span>
      </div>
      <p>${s.description}</p>
      <span class="open-cta">Open in Live Runner →</span>
    </a>`;
  }).join("");
}

function refresh(mode) {
  renderScoreChart(mode);
  renderHeatmap(mode);
  renderOutcomeChart(mode);
}

document.addEventListener("DOMContentLoaded", () => {
  BR.initNav("dashboard");
  renderRobustnessChart();
  renderDifficulty();
  renderLibrary();
  refresh(BR.activeMode());
  BR.bindModeTabs(refresh);
  window.addEventListener("br-theme-change", () => {
    renderRobustnessChart();
    refresh(BR.activeMode());
  });
});
