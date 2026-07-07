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
    findings.push({ severity: "warning", text: "Application confidence below threshold" });
  }
  for (const [name, node] of Object.entries(r.value_confidence || {})) {
    if (node.confidence < r.automation_threshold) {
      findings.push({ severity: "warning", text: `Low value confidence: ${name}` });
    }
  }
  if (!r.audit_trail_complete) {
    findings.push({ severity: "critical", text: "Incomplete audit trail" });
  }
  if (r.decision === "auto_approve" && (r.human_review_queue || []).length) {
    findings.push({ severity: "critical", text: "auto_approve with human review queue" });
  }
  if (r.session_recall_used) {
    findings.push({ severity: "info", text: "Session recall used — verify provenance" });
  }
  if (!findings.length) findings.push({ severity: "ok", text: "No client-side findings" });
  return findings;
}

function renderReceipt(r) {
  window.__lastReceipt = r;
  const dec = r.decision || "—";
  document.getElementById("decision").textContent = dec;
  document.getElementById("decision").className = `decision-pill ${decisionClass(dec)}`;
  document.getElementById("heroDecision").textContent = dec;
  document.getElementById("heroDecision").className = `decision-pill ${decisionClass(dec)}`;
  document.getElementById("appConf").textContent = fmt(r.application_confidence);
  document.getElementById("threshold").textContent = fmt(r.automation_threshold, 2);
  document.getElementById("audit").textContent = r.audit_trail_complete ? "complete" : "incomplete";

  const vt = document.querySelector("#valueTable tbody");
  vt.innerHTML = Object.entries(r.value_confidence || {})
    .map(([k, n]) => `<tr><td>${k}</td><td>${n.value}</td><td>${fmt(n.confidence)}</td></tr>`)
    .join("");

  const ct = document.querySelector("#checkTable tbody");
  ct.innerHTML = Object.entries(r.check_confidence || {})
    .map(([k, n]) => `<tr><td>${k}</td><td>${n.passed ? "✓" : "✗"}</td><td>${fmt(n.confidence)}</td></tr>`)
    .join("");

  const rules = document.getElementById("rulesList");
  rules.innerHTML = (r.rules_fired || []).length
    ? r.rules_fired.map((rule) => `<li><strong>${rule.id}</strong> — ${rule.condition} → <code>${rule.action}</code></li>`).join("")
    : "<li>(none)</li>";

  const doc = document.getElementById("doctorList");
  doc.innerHTML = clientDoctor(r)
    .map((f) => `<li>[${f.severity}] ${f.text}</li>`)
    .join("");
}

async function loadScenario(file) {
  try {
    const res = await fetch(dataUrl(file), { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    renderReceipt(await res.json());
  } catch (err) {
    console.warn("fetch failed, using embedded demo", err);
    if (window.EMBEDDED_DEMOS && window.EMBEDDED_DEMOS[file]) {
      renderReceipt(window.EMBEDDED_DEMOS[file]);
      return;
    }
    document.getElementById("doctorList").innerHTML =
      `<li>[critical] Failed to load demo data: ${err.message}</li>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const sel = document.getElementById("scenarioSelect");
  sel.addEventListener("change", () => loadScenario(sel.value));
  loadScenario(sel.value);
});
