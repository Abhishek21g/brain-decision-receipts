from __future__ import annotations

import json
from pathlib import Path

from brain_decision_receipts.confidence import (
    application_confidence,
    low_confidence_fields,
    score_checks,
    score_values,
)
from brain_decision_receipts.models import (
    CaseInput,
    HumanReviewItem,
    Receipt,
    RuleFired,
    StageRecord,
)
from brain_decision_receipts.planner import evaluate_rules, load_rules, load_case, build_manifest


def run_pipeline(case_path: Path, out_dir: Path) -> Receipt:
    case = load_case(case_path)
    manifest = build_manifest(case)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "manifest.json").write_text(json.dumps(manifest.to_dict(), indent=2) + "\n")
    meta = {
        "case_path": str(case_path.resolve()),
        "rules_version_expected": case.rules_version_expected or case.rules_version,
    }
    (out_dir / "case.meta.json").write_text(json.dumps(meta, indent=2) + "\n")

    receipt = Receipt(
        case_id=case.case_id,
        domain=case.domain,
        rules_version=case.rules_version,
        model_version=case.model_version,
        automation_threshold=case.automation_threshold,
        session_recall_used=case.session_recall_used,
    )

    receipt.stages.append(StageRecord("extract", "ok", f"{len(case.documents)} documents"))
    value_conf = score_values(case)
    receipt.value_confidence = value_conf
    receipt.stages.append(StageRecord("score", "ok", f"{len(value_conf)} value nodes"))

    checks = score_checks(case)
    receipt.check_confidence = {
        k: {
            "passed": v.passed,
            "confidence": v.confidence,
            "depends_on": v.depends_on,
            "message": v.message,
        }
        for k, v in checks.items()
    }
    receipt.application_confidence = application_confidence(checks)
    receipt.stages.append(
        StageRecord("score", "ok", f"application_confidence={receipt.application_confidence}")
    )

    rules = load_rules(case.rules_version)
    fired = evaluate_rules(case, rules)
    receipt.rules_fired = fired
    receipt.stages.append(StageRecord("rules", "ok", f"{len(fired)} rules fired"))

    receipt.human_review_queue = [
        HumanReviewItem(field=name, reason="below automation threshold", confidence=conf)
        for name, conf in low_confidence_fields(case)
    ]

    if case.poisoned_context_detected and case.session_recall_used:
        receipt.human_review_queue.append(
            HumanReviewItem(
                field="session_recall",
                reason="poisoned context detected in recalled session",
                confidence=0.0,
            )
        )

    receipt.decision = _decide(case, receipt, fired)
    receipt.stages.append(StageRecord("decision", "ok", receipt.decision))
    receipt.audit_trail_complete = _audit_complete(receipt)
    receipt.notes.append("synthetic mock pipeline — not Brain Co. GovOS/InsuranceOS")

    (out_dir / "receipt.json").write_text(json.dumps(receipt.to_dict(), indent=2) + "\n")
    return receipt


def _decide(case: CaseInput, receipt: Receipt, fired: list[RuleFired]) -> str:
    if any(r.action == "reject" for r in fired):
        return "reject"
    if receipt.human_review_queue:
        return "human_review"
    if receipt.application_confidence < case.automation_threshold:
        return "human_review"
    if any(r.action == "require_human_review" for r in fired):
        return "human_review"
    return "auto_approve"


def _audit_complete(receipt: Receipt) -> bool:
    required = {"extract", "score", "rules", "decision"}
    names = {s.name for s in receipt.stages}
    return (
        required.issubset(names)
        and bool(receipt.value_confidence)
        and bool(receipt.check_confidence)
        and receipt.application_confidence > 0
    )
