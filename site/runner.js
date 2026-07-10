let activeScenario = BR.SCENARIOS[0];
let lastReceipt = null;
let running = false;

function clientDoctor(r) {
  const findings = [];
  if (r.application_confidence < r.automation_threshold) {
    findings.push({
      severity: "warning",
      code: "low_application_confidence",
      text: `Application confidence ${BR.fmt(r.application_confidence)} below threshold ${BR.fmt(r.automation_threshold)}.`,
    });
  }
  for (const [name, node] of Object.entries(r.value_confidence || {})) {
    if (node.confidence < r.automation_threshold) {
      findings.push({
        severity: "warning",
        code: "low_value_confidence",
        text: `Value '${name}' confidence ${BR.fmt(node.confidence)} below threshold.`,
      });
    }
  }
  if (!r.audit_trail_complete) {
    findings.push({
      severity: "critical",
      code: "incomplete_audit_trail",
      text: "Receipt missing required pipeline stages or confidence nodes.",
    });
  }
  if (r.rules_version?.includes("2025.12")) {
    findings.push({
      severity: "critical",
      code: "rules_version_drift",
      text: `Rules version ${r.rules_version} may be stale vs current bundle.`,
    });
  }
  if (!findings.length) {
    findings.push({
      severity: "ok",
      code: "clean",
      text: "No doctor findings — receipt passes mock gates.",
    });
  }
  return findings;
}

function logLine(html) {
  const t = document.getElementById("terminal");
  t.innerHTML += `\n${html}`;
  t.scrollTop = t.scrollHeight;
}

function resetPipeline() {
  document.querySelectorAll(".pipe-card").forEach((c) => {
    c.classList.remove("running", "done", "error");
  });
  ["stepExtract", "stepScore", "stepRules", "stepDecision"].forEach((id) => {
    document.getElementById(id).textContent = "waiting…";
  });
}

function setStep(step, state, detail) {
  const card = document.querySelector(`.pipe-card[data-step="${step}"]`);
  card.classList.remove("running", "done", "error");
  if (state) card.classList.add(state);
  const id = { extract: "stepExtract", score: "stepScore", rules: "stepRules", decision: "stepDecision" }[step];
  if (id) document.getElementById(id).textContent = detail;
}

function renderInspector(r) {
  const cls = BR.decisionClass(r.decision);
  const dec = document.getElementById("inspDecision");
  dec.textContent = r.decision;
  dec.className = `decision-pill ${cls}`;
  document.getElementById("inspConf").textContent = BR.fmt(r.application_confidence);
  document.getElementById("inspThreshold").textContent = BR.fmt(r.automation_threshold, 2);
  document.getElementById("inspRules").textContent = String((r.rules_fired || []).length);
  document.getElementById("receiptPreview").textContent = JSON.stringify(r, null, 2);
  document.getElementById("findingsList").innerHTML = clientDoctor(r)
    .map(
      (f) =>
        `<li class="finding ${f.severity}"><strong>${f.code}</strong><p>${f.text}</p></li>`
    )
    .join("");
}

function selectScenario(s) {
  activeScenario = s;
  document.querySelectorAll(".scenario-pick button").forEach((b) => {
    b.classList.toggle("active", b.dataset.slug === s.slug);
  });
  document.getElementById("runnerTitle").textContent = s.title;
  document.getElementById("runnerMeta").textContent = `${s.domain} · ${s.files} files · rules ${s.rules}`;
  document.getElementById("fileTree").innerHTML = s.documents.map((d) => `<li>${d}</li>`).join("");
  document.getElementById("terminal").innerHTML =
    `<span class="line-dim">$ brain-receipts plan scenarios/${s.file}</span>\n<span class="line-ok">✓ manifest valid</span>\n<span class="line-dim">$ brain-receipts run — press Run pipeline</span>`;
  resetPipeline();
  lastReceipt = null;
  document.getElementById("inspDecision").textContent = "—";
  document.getElementById("inspConf").textContent = "—";
  document.getElementById("inspRules").textContent = "—";
  document.getElementById("receiptPreview").textContent = "{}";
  document.getElementById("findingsList").innerHTML =
    '<li class="finding"><p>Run pipeline to evaluate receipt.</p></li>';
}

async function runPipeline() {
  if (running) return;
  running = true;
  document.getElementById("runBtn").disabled = true;
  resetPipeline();
  logLine(`<span class="line-dim">$ brain-receipts run scenarios/${activeScenario.file}</span>`);

  const delays = [600, 800, 700, 500];
  const steps = [
    {
      step: "extract",
      run: async (r) => {
        const n = Object.keys(r.value_confidence || {}).length;
        setStep("extract", "running", "extracting…");
        logLine(`<span class="line-dim">→ extract: ${n} value nodes from ${activeScenario.files} documents</span>`);
        return `ok · ${n} value nodes`;
      },
    },
    {
      step: "score",
      run: async (r) => {
        setStep("score", "running", "scoring DAG…");
        logLine(`<span class="line-dim">→ score: application_confidence=${BR.fmt(r.application_confidence)}</span>`);
        return `conf ${BR.fmt(r.application_confidence)}`;
      },
    },
    {
      step: "rules",
      run: async (r) => {
        const n = (r.rules_fired || []).length;
        setStep("rules", "running", "evaluating…");
        for (const rule of r.rules_fired || []) {
          logLine(`<span class="line-warn">→ rule ${rule.id}: ${rule.action}</span>`);
        }
        return `${n} rules fired`;
      },
    },
    {
      step: "decision",
      run: async (r) => {
        setStep("decision", "running", "deciding…");
        const cls = r.decision === "auto_approve" ? "line-ok" : r.decision === "reject" ? "line-bad" : "line-warn";
        logLine(`<span class="${cls}">✓ decision: ${r.decision}</span>`);
        return r.decision;
      },
    },
  ];

  let receipt;
  try {
    receipt = await BR.loadReceipt(activeScenario.file);
  } catch (e) {
    logLine(`<span class="line-bad">✗ ${e.message}</span>`);
    running = false;
    document.getElementById("runBtn").disabled = false;
    return;
  }

  for (let i = 0; i < steps.length; i++) {
    const { step, run } = steps[i];
    await new Promise((r) => setTimeout(r, delays[i]));
    const detail = await run(receipt);
    setStep(step, "done", detail);
  }

  lastReceipt = receipt;
  renderInspector(receipt);
  logLine(`<span class="line-ok">✓ receipt written to .brain-receipts/receipt.json</span>`);
  running = false;
  document.getElementById("runBtn").disabled = false;
}

document.addEventListener("DOMContentLoaded", () => {
  BR.initNav("runner");
  const pick = document.getElementById("scenarioPick");
  pick.innerHTML = BR.SCENARIOS.map(
    (s) => `<button type="button" data-slug="${s.slug}">${s.title}</button>`
  ).join("");
  pick.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const s = BR.SCENARIOS.find((x) => x.slug === btn.dataset.slug);
      if (s) selectScenario(s);
    });
  });

  const params = new URLSearchParams(window.location.search);
  const slug = params.get("scenario");
  const initial = BR.SCENARIOS.find((s) => s.slug === slug) || BR.SCENARIOS[0];
  selectScenario(initial);

  document.getElementById("runBtn").addEventListener("click", runPipeline);
  document.getElementById("copyBtn").addEventListener("click", async () => {
    if (!lastReceipt) return;
    await navigator.clipboard.writeText(JSON.stringify(lastReceipt, null, 2));
  });
  document.getElementById("downloadBtn").addEventListener("click", () => {
    if (!lastReceipt) return;
    const blob = new Blob([JSON.stringify(lastReceipt, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${lastReceipt.case_id || "receipt"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
});
