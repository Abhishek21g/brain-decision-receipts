from __future__ import annotations

import json
from pathlib import Path

import pytest

from brain_decision_receipts.confidence import (
    application_confidence,
    low_confidence_fields,
    score_checks,
)
from brain_decision_receipts.doctor import diagnose
from brain_decision_receipts.models import CaseInput, ValueField
from brain_decision_receipts.pipeline import run_pipeline
from brain_decision_receipts.planner import build_manifest, evaluate_rules, load_case, load_rules


ROOT = Path(__file__).resolve().parents[1]
SCENARIOS = ROOT / "scenarios"


def test_manifest_requires_documents():
    case = CaseInput(
        case_id="x",
        domain="permit",
        rules_version="zoning-r1-2026.01",
        automation_threshold=0.85,
        model_version="v",
        documents=[],
        extracted_values={"a": ValueField(1, 0.9)},
    )
    with pytest.raises(ValueError, match="document"):
        build_manifest(case)


def test_manifest_rejects_bad_confidence():
    case = CaseInput(
        case_id="x",
        domain="permit",
        rules_version="zoning-r1-2026.01",
        automation_threshold=0.85,
        model_version="v",
        documents=["a.pdf"],
        extracted_values={"a": ValueField(1, 1.5)},
    )
    with pytest.raises(ValueError, match="confidence"):
        build_manifest(case)


def test_load_permit_auto_approve_case():
    case = load_case(SCENARIOS / "permit-auto-approve.json")
    assert case.case_id == "permit-001"
    assert case.domain == "permit"


def test_permit_checks_pass_for_auto_approve():
    case = load_case(SCENARIOS / "permit-auto-approve.json")
    checks = score_checks(case)
    assert checks["bedroom_window_check"].passed
    assert checks["setback_compliance"].passed


def test_application_confidence_is_min_of_checks():
    case = load_case(SCENARIOS / "permit-human-review.json")
    checks = score_checks(case)
    assert application_confidence(checks) == pytest.approx(0.62)


def test_low_confidence_fields_detected():
    case = load_case(SCENARIOS / "permit-human-review.json")
    low = low_confidence_fields(case)
    assert ("window_count_per_bedroom", 0.62) in low


def test_rule_fires_on_low_window_confidence():
    case = load_case(SCENARIOS / "permit-human-review.json")
    rules = load_rules(case.rules_version)
    fired = evaluate_rules(case, rules)
    assert any(r.id == "R-18" for r in fired)


def test_rule_auto_approve_small_residential():
    case = load_case(SCENARIOS / "permit-auto-approve.json")
    fired = evaluate_rules(case, load_rules(case.rules_version))
    assert any(r.id == "R-12" for r in fired)


def test_pipeline_permit_auto_approve(tmp_path: Path):
    receipt = run_pipeline(SCENARIOS / "permit-auto-approve.json", tmp_path)
    assert receipt.decision == "auto_approve"
    assert receipt.audit_trail_complete
    assert receipt.application_confidence >= 0.85


def test_pipeline_permit_human_review(tmp_path: Path):
    receipt = run_pipeline(SCENARIOS / "permit-human-review.json", tmp_path)
    assert receipt.decision == "human_review"
    assert receipt.human_review_queue


def test_pipeline_claim_reject(tmp_path: Path):
    receipt = run_pipeline(SCENARIOS / "claim-rules-mismatch.json", tmp_path)
    assert receipt.decision == "reject"
    assert any(r.id == "C-11" for r in receipt.rules_fired)


def test_receipt_written_to_disk(tmp_path: Path):
    run_pipeline(SCENARIOS / "permit-auto-approve.json", tmp_path)
    data = json.loads((tmp_path / "receipt.json").read_text())
    assert data["schema_version"] == "1.0"
    assert "value_confidence" in data


def test_doctor_clean_receipt(tmp_path: Path):
    run_pipeline(SCENARIOS / "permit-auto-approve.json", tmp_path)
    findings = diagnose(tmp_path / "receipt.json")
    assert not any(f.severity == "critical" for f in findings)


def test_doctor_flags_low_confidence(tmp_path: Path):
    run_pipeline(SCENARIOS / "permit-human-review.json", tmp_path)
    findings = diagnose(tmp_path / "receipt.json")
    codes = {f.code for f in findings}
    assert "low_value_confidence" in codes


def test_doctor_flags_rules_drift(tmp_path: Path):
    run_pipeline(SCENARIOS / "claim-rules-mismatch.json", tmp_path)
    findings = diagnose(tmp_path / "receipt.json")
    assert any(f.code == "rules_version_drift" for f in findings)


def test_doctor_poisoned_recall(tmp_path: Path):
    run_pipeline(SCENARIOS / "permit-auto-approve.json", tmp_path)
    receipt_path = tmp_path / "receipt.json"
    data = json.loads(receipt_path.read_text())
    data["session_recall_used"] = True
    data["human_review_queue"] = [
        {"field": "session_recall", "reason": "poisoned", "confidence": 0.0}
    ]
    receipt_path.write_text(json.dumps(data))
    findings = diagnose(receipt_path)
    assert any(f.code == "poisoned_recall_context" for f in findings)


def test_receipt_schema_has_required_keys(tmp_path: Path):
    run_pipeline(SCENARIOS / "permit-auto-approve.json", tmp_path)
    data = json.loads((tmp_path / "receipt.json").read_text())
    for key in (
        "value_confidence",
        "check_confidence",
        "application_confidence",
        "rules_fired",
        "decision",
        "audit_trail_complete",
    ):
        assert key in data


def test_stages_cover_pipeline(tmp_path: Path):
    run_pipeline(SCENARIOS / "permit-auto-approve.json", tmp_path)
    data = json.loads((tmp_path / "receipt.json").read_text())
    names = {s["name"] for s in data["stages"]}
    assert {"extract", "score", "rules", "decision"}.issubset(names)


def test_claim_checks_include_pre_existing():
    case = load_case(SCENARIOS / "claim-rules-mismatch.json")
    checks = score_checks(case)
    assert "pre_existing_exclusion" in checks


def test_manifest_lists_value_fields():
    case = load_case(SCENARIOS / "permit-auto-approve.json")
    manifest = build_manifest(case)
    assert "roof_area_sqft" in manifest.value_fields


def test_rules_reject_pre_existing_bool():
    case = load_case(SCENARIOS / "claim-rules-mismatch.json")
    fired = evaluate_rules(case, load_rules(case.rules_version))
    assert any(r.action == "reject" for r in fired)


def test_human_review_queue_empty_on_auto_approve(tmp_path: Path):
    receipt = run_pipeline(SCENARIOS / "permit-auto-approve.json", tmp_path)
    assert receipt.human_review_queue == []


def test_case_meta_written_on_run(tmp_path: Path):
    run_pipeline(SCENARIOS / "claim-rules-mismatch.json", tmp_path)
    meta = json.loads((tmp_path / "case.meta.json").read_text())
    assert meta["rules_version_expected"] == "insurance-trip-cancel-2026.01"
