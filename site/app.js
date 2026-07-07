const SCENARIOS = [
  {
    file: "permit-auto-approve.json",
    label: "Permit · auto approve",
    insight: "All value and check nodes above 0.85 — R-12 fires for small R1 residential. Full automation path.",
  },
  {
    file: "permit-human-review.json",
    label: "Permit · human review",
    insight: "window_count_per_bedroom confidence 0.62 — R-18 fires. Application confidence drops below threshold.",
  },
  {
    file: "claim-rules-mismatch.json",
    label: "Claim · reject + drift",
    insight: "Rules bundle 2025.12 vs expected 2026.01. C-11 pre-existing exclusion → reject.",
  },
];

const DAG = {
  permit: {
    values: ["roof_area_sqft", "zone_classification", "window_count_per_bedroom"],
    checks: {
      bedroom_window_check: ["window_count_per_bedroom"],
      setback_compliance: ["roof_area_sqft", "zone_classification"],
    },
    app: "application",
  },
  claim: {
    values: ["claim_incident_date", "notice_hours", "coverage_section_match", "pre_existing_flag"],
    checks: {
      trip_cancel_72hr_notice: ["claim_incident_date", "notice_hours"],
      pre_existing_exclusion: ["coverage_section_match", "pre_existing_flag"],
    },
    app: "application",
  },
};

let chart = null;
let activeFile = SCENARIOS[0].file;

function fmt(v, d = 3) {
  return v == null ? "—" : Number(v).toFixed(d);
}

function decisionClass(d) {
  if (d === "auto_approve") return "good";
  if (d === "reject") return "bad";
  return "warn";
}

function dataUrl(file) {
  const base = window.location.pathname.replace(/\/index\.html$/, "").replace(/\/?$/, "/");
  return `${base}data/${file}`;
}

function clientDoctor(r) {
  const findings = [];
  if (r.application_confidence < r.automation_threshold) {
    findings.push({
      severity: "warning",
      code: "low_application_confidence",
      text: `Application confidence ${fmt(r.application_confidence)} below threshold ${fmt(r.automation_threshold)}.`,
      suggestion: "Route to human review or gather more evidence.",
    });
  }
  for (const [name, node] of Object.entries(r.value_confidence || {})) {
    if (node.confidence < r.automation_threshold) {
      findings.push({
        severity: "warning",
        code: "low_value_confidence",
        text: `Value '${name}' confidence ${fmt(node.confidence)} below threshold.`,
        suggestion: "Re-run extraction or require human verification.",
      });
    }
  }
  if (!r.audit_trail_complete) {
    findings.push({
      severity: "critical",
      code: "incomplete_audit_trail",
      text: "Receipt missing required pipeline stages or confidence nodes.",
      suggestion: "Re-run the full extract → score → rules → decision pipeline.",
    });
  }
  if (r.decision === "auto_approve" && (r.human_review_queue || []).length) {
    findings.push({
      severity: "critical",
      code: "decision_mismatch",
      text: "Decision is auto_approve but human_review_queue is non-empty.",
      suggestion: "Receipt logic error — re-run pipeline.",
    });
  }
  if (r.rules_version && r.rules_version.includes("2025.12")) {
    findings.push({
      severity: "critical",
      code: "rules_version_drift",
      text: `Rules version ${r.rules_version} may be stale vs current bundle.`,
      suggestion: "Re-evaluate against latest regulation YAML before automation.",
    });
  }
  if (r.session_recall_used) {
    findings.push({
      severity: "info",
      code: "session_recall_used",
      text: "Session recall contributed to this case.",
      suggestion: "Treat recalled context as untrusted input.",
    });
  }
  if (!findings.length) {
    findings.push({
      severity: "ok",
      code: "clean",
      text: "No doctor findings — receipt passes mock gates.",
      suggestion: "",
    });
  }
  return findings;
}

function confBarClass(conf, threshold) {
  if (conf >= threshold) return "bar-good";
  if (conf >= threshold - 0.15) return "bar-warn";
  return "bar-bad";
}

function renderPipeline(stages) {
  const flow = document.getElementById("pipelineFlow");
  const names = ["extract", "score", "rules", "decision"];
  const status = Object.fromEntries((stages || []).map((s) => [s.name, s]));
  flow.innerHTML = names
    .map((name, i) => {
      const stage = status[name];
      const ok = stage && stage.status === "ok";
      const arrow = i < names.length - 1 ? '<span class="pipe-arrow">→</span>' : "";
      return `<div class="pipe-step ${ok ? "done" : ""}">
        <span class="pipe-num">0${i + 1}</span>
        <strong>${name}</strong>
        <span class="pipe-detail">${stage?.detail || "pending"}</span>
      </div>${arrow}`;
    })
    .join("");
}

function renderDag(r) {
  const el = document.getElementById("dagViz");
  const spec = DAG[r.domain] || DAG.permit;
  const threshold = r.automation_threshold || 0.85;
  const valueNodes = spec.values
    .map((name) => {
      const node = r.value_confidence?.[name];
      const conf = node?.confidence ?? 0;
      return `<div class="dag-node l1 ${confBarClass(conf, threshold)}"><span>L1</span>${name}<em>${fmt(conf)}</em></div>`;
    })
    .join("");
  const checkNodes = Object.entries(spec.checks)
    .map(([check, deps]) => {
      const node = r.check_confidence?.[check];
      const conf = node?.confidence ?? 0;
      const pass = node?.passed ? "pass" : "fail";
      return `<div class="dag-node l2 ${confBarClass(conf, threshold)} ${pass}">
        <span>L2</span>${check}<em>${fmt(conf)}</em>
        <small>← ${deps.join(", ")}</small>
      </div>`;
    })
    .join("");
  const appConf = r.application_confidence ?? 0;
  el.innerHTML = `
    <div class="dag-tier"><div class="dag-label">Value extraction</div><div class="dag-row">${valueNodes}</div></div>
    <div class="dag-connector">↓ min confidence propagates</div>
    <div class="dag-tier"><div class="dag-label">Regulation checks</div><div class="dag-row">${checkNodes}</div></div>
    <div class="dag-connector">↓</div>
    <div class="dag-node l3 ${confBarClass(appConf, threshold)}">
      <span>L3</span>Application confidence<em>${fmt(appConf)}</em>
      <small>decision: ${r.decision}</small>
    </div>`;
}

function renderChart(r) {
  const canvas = document.getElementById("confidenceChart");
  if (!canvas || !window.Chart) return;
  const labels = [];
  const values = [];
  for (const [k, v] of Object.entries(r.value_confidence || {})) {
    labels.push(`V:${k}`);
    values.push(v.confidence);
  }
  for (const [k, v] of Object.entries(r.check_confidence || {})) {
    labels.push(`C:${k}`);
    values.push(v.confidence);
  }
  labels.push("L3:application");
  values.push(r.application_confidence);
  const threshold = r.automation_threshold || 0.85;
  const colors = values.map((v) =>
    v >= threshold ? "#42d392" : v >= threshold - 0.15 ? "#f0b429" : "#f07178"
  );
  if (chart) chart.destroy();
  chart = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Confidence",
          data: values,
          backgroundColor: colors,
          borderRadius: 4,
        },
        {
          label: "Threshold",
          data: labels.map(() => threshold),
          type: "line",
          borderColor: "#6ea8ff",
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { min: 0, max: 1, ticks: { color: "#8d9bb3" }, grid: { color: "#283246" } },
        x: { ticks: { color: "#8d9bb3", maxRotation: 45, minRotation: 45 }, grid: { display: false } },
      },
    },
  });
}

function renderReceipt(r) {
  window.__lastReceipt = r;
  const dec = r.decision || "—";
  const decCls = decisionClass(dec);

  document.getElementById("decision").textContent = dec;
  document.getElementById("decision").className = `decision-pill ${decCls}`;
  document.getElementById("heroDecision").textContent = dec;
  document.getElementById("heroDecision").className = `decision-pill ${decCls}`;
  document.getElementById("heroCaseId").textContent = r.case_id || "—";
  document.getElementById("heroAppConf").textContent = fmt(r.application_confidence);
  document.getElementById("heroRulesCount").textContent = (r.rules_fired || []).length;

  document.getElementById("appConf").textContent = fmt(r.application_confidence);
  document.getElementById("threshold").textContent = fmt(r.automation_threshold, 2);
  document.getElementById("audit").textContent = r.audit_trail_complete ? "complete" : "incomplete";
  document.getElementById("audit").className = r.audit_trail_complete ? "audit-good" : "audit-bad";

  document.getElementById("caseMeta").textContent = `${r.domain} · ${r.case_id} · rules ${r.rules_version} · model ${r.model_version}`;

  const scenario = SCENARIOS.find((s) => s.file === activeFile);
  const insight = document.getElementById("scenarioInsight");
  if (scenario) {
    insight.hidden = false;
    insight.textContent = scenario.insight;
  }

  const vt = document.querySelector("#valueTable tbody");
  const threshold = r.automation_threshold || 0.85;
  vt.innerHTML = Object.entries(r.value_confidence || {})
    .map(([k, n]) => {
      const bar = `<div class="micro-bar"><div class="micro-fill ${confBarClass(n.confidence, threshold)}" style="width:${Math.round(n.confidence * 100)}%"></div></div>`;
      return `<tr><td>${k}</td><td>${n.value}</td><td>${fmt(n.confidence)}</td><td>${bar}</td></tr>`;
    })
    .join("");

  const ct = document.querySelector("#checkTable tbody");
  ct.innerHTML = Object.entries(r.check_confidence || {})
    .map(([k, n]) => {
      const pass = n.passed
        ? '<span class="pass-badge">pass</span>'
        : '<span class="fail-badge">fail</span>';
      return `<tr><td>${k}</td><td>${pass}</td><td>${fmt(n.confidence)}</td><td class="deps">${(n.depends_on || []).join(", ")}</td></tr>`;
    })
    .join("");

  const rulesEl = document.getElementById("rulesTable");
  rulesEl.innerHTML = (r.rules_fired || []).length
    ? `<table><thead><tr><th>ID</th><th>Condition</th><th>Action</th><th>MECE</th></tr></thead><tbody>${r.rules_fired
        .map(
          (rule) =>
            `<tr><td><code>${rule.id}</code></td><td>${rule.condition}</td><td><span class="action-pill ${decisionClass(rule.action === "auto_approve" ? "auto_approve" : rule.action === "reject" ? "reject" : "human_review")}">${rule.action}</span></td><td>${rule.mece_bucket}</td></tr>`
        )
        .join("")}</tbody></table>`
    : "<p class='muted'>(no rules fired)</p>";

  const review = document.getElementById("reviewQueue");
  review.innerHTML = (r.human_review_queue || []).length
    ? r.human_review_queue
        .map(
          (item) =>
            `<li><strong>${item.field}</strong><span>${item.reason}</span><em>conf ${fmt(item.confidence)}</em></li>`
        )
        .join("")
    : "<li class='muted empty-queue'>Queue empty — eligible for full automation</li>";

  const doc = document.getElementById("doctorList");
  doc.innerHTML = clientDoctor(r)
    .map(
      (f) =>
        `<li class="finding ${f.severity}"><span class="sev">${f.severity}</span><div><strong>${f.code}</strong><p>${f.text}</p>${f.suggestion ? `<small>→ ${f.suggestion}</small>` : ""}</div></li>`
    )
    .join("");

  document.getElementById("receiptJson").textContent = JSON.stringify(r, null, 2);
  renderPipeline(r.stages);
  renderDag(r);
  renderChart(r);
}

async function loadScenario(file) {
  activeFile = file;
  document.querySelectorAll(".scenario-chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.file === file);
  });
  try {
    const res = await fetch(dataUrl(file), { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    renderReceipt(await res.json());
  } catch (err) {
    if (window.EMBEDDED_DEMOS?.[file]) {
      renderReceipt(window.EMBEDDED_DEMOS[file]);
      return;
    }
    document.getElementById("doctorList").innerHTML =
      `<li class="finding critical"><span class="sev">critical</span><div><strong>load_error</strong><p>${err.message}</p></div></li>`;
  }
}

function initScenarioChips() {
  const wrap = document.getElementById("scenarioChips");
  wrap.innerHTML = SCENARIOS.map(
    (s, i) =>
      `<button type="button" class="scenario-chip ${i === 0 ? "active" : ""}" data-file="${s.file}" role="tab">${s.label}</button>`
  ).join("");
  wrap.querySelectorAll(".scenario-chip").forEach((chip) => {
    chip.addEventListener("click", () => loadScenario(chip.dataset.file));
  });
}

function initToolbar() {
  document.getElementById("fileInput").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    renderReceipt(JSON.parse(await file.text()));
  });
  document.getElementById("copyReceipt").addEventListener("click", async () => {
    if (!window.__lastReceipt) return;
    await navigator.clipboard.writeText(JSON.stringify(window.__lastReceipt, null, 2));
    const btn = document.getElementById("copyReceipt");
    const prev = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => (btn.textContent = prev), 1500);
  });
  document.getElementById("downloadReceipt").addEventListener("click", () => {
    if (!window.__lastReceipt) return;
    const blob = new Blob([JSON.stringify(window.__lastReceipt, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${window.__lastReceipt.case_id || "receipt"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initScenarioChips();
  initToolbar();
  loadScenario(SCENARIOS[0].file);
});
