from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from brain_decision_receipts.models import Finding, Receipt

SEVERITY_ORDER = {"critical": 0, "warning": 1, "info": 2}


def load_receipt(path: Path) -> Receipt:
    data = json.loads(path.read_text())
    return _receipt_from_dict(data)


def diagnose(path: Path) -> list[Finding]:
    receipt = load_receipt(path)
    findings: list[Finding] = []
    findings.extend(_check_application_confidence(receipt))
    findings.extend(_check_low_value_confidence(receipt))
    findings.extend(_check_rules_drift(path, receipt))
    findings.extend(_check_audit_trail(receipt))
    findings.extend(_check_poisoned_recall(receipt))
    findings.extend(_check_decision_consistency(receipt))
    findings.sort(key=lambda f: SEVERITY_ORDER.get(f.severity, 9))
    return findings


def _check_application_confidence(receipt: Receipt) -> list[Finding]:
    if receipt.application_confidence < receipt.automation_threshold:
        return [
            Finding(
                "warning",
                "low_application_confidence",
                f"Application confidence {receipt.application_confidence} is below threshold {receipt.automation_threshold}.",
                "Route to human review or gather more evidence for low-confidence checks.",
            )
        ]
    return []


def _check_low_value_confidence(receipt: Receipt) -> list[Finding]:
    findings = []
    for name, node in receipt.value_confidence.items():
        conf = float(node.get("confidence", 0))
        if conf < receipt.automation_threshold:
            findings.append(
                Finding(
                    "warning",
                    "low_value_confidence",
                    f"Value '{name}' confidence {conf} is below threshold.",
                    "Re-run extraction or require human verification for this field.",
                )
            )
    return findings


def _check_rules_drift(path: Path, receipt: Receipt) -> list[Finding]:
  # optional sidecar records expected rules version
    meta_path = path.parent / "case.meta.json"
    if not meta_path.exists():
        return []
    meta = json.loads(meta_path.read_text())
    expected = meta.get("rules_version_expected")
    if expected and expected != receipt.rules_version:
        return [
            Finding(
                "critical",
                "rules_version_drift",
                f"Receipt rules version {receipt.rules_version} != expected {expected}.",
                "Re-run rules engine against current regulation bundle before automation.",
            )
        ]
    return []


def _check_audit_trail(receipt: Receipt) -> list[Finding]:
    if receipt.audit_trail_complete:
        return []
    return [
        Finding(
            "critical",
            "incomplete_audit_trail",
            "Receipt is missing required pipeline stages or confidence nodes.",
            "Re-run the full extract → score → rules → decision pipeline.",
        )
    ]


def _check_poisoned_recall(receipt: Receipt) -> list[Finding]:
    if not receipt.session_recall_used:
        return []
    poisoned = any(
        item.field == "session_recall" for item in receipt.human_review_queue
    )
    if poisoned:
        return [
            Finding(
                "critical",
                "poisoned_recall_context",
                "Session recall was used and poisoned context was detected.",
                "Do not auto-approve; sanitize or exclude recalled session text.",
            )
        ]
    return [
        Finding(
            "info",
            "session_recall_used",
            "Session recall contributed to this case — verify provenance.",
            "Ensure recalled context is treated as untrusted input.",
        )
    ]


def _check_decision_consistency(receipt: Receipt) -> list[Finding]:
    if receipt.decision == "auto_approve" and receipt.human_review_queue:
        return [
            Finding(
                "critical",
                "decision_mismatch",
                "Decision is auto_approve but human_review_queue is non-empty.",
                "Receipt logic error — re-run pipeline.",
            )
        ]
    if receipt.decision == "auto_approve" and receipt.application_confidence < receipt.automation_threshold:
        return [
            Finding(
                "critical",
                "decision_mismatch",
                "Decision is auto_approve below application confidence threshold.",
                "Re-run pipeline or fix threshold configuration.",
            )
        ]
    return []


def _receipt_from_dict(data: dict[str, Any]) -> Receipt:
    from brain_decision_receipts.models import HumanReviewItem, RuleFired, StageRecord

    return Receipt(
        schema_version=data.get("schema_version", "1.0"),
        case_id=data.get("case_id", ""),
        domain=data.get("domain", "permit"),
        rules_version=data.get("rules_version", ""),
        model_version=data.get("model_version", ""),
        stages=[StageRecord(**s) for s in data.get("stages", [])],
        value_confidence=data.get("value_confidence", {}),
        check_confidence=data.get("check_confidence", {}),
        application_confidence=float(data.get("application_confidence", 0)),
        automation_threshold=float(data.get("automation_threshold", 0.85)),
        decision=data.get("decision", "human_review"),
        rules_fired=[RuleFired(**r) for r in data.get("rules_fired", [])],
        human_review_queue=[HumanReviewItem(**h) for h in data.get("human_review_queue", [])],
        audit_trail_complete=bool(data.get("audit_trail_complete", False)),
        session_recall_used=bool(data.get("session_recall_used", False)),
        notes=list(data.get("notes", [])),
    )
