from __future__ import annotations

from brain_decision_receipts.models import CaseInput, CheckResult, ValueField

# Synthetic confidence DAG — mirrors Brain Co. blog three-tier shape (not proprietary).

PERMIT_CHECKS: dict[str, list[str]] = {
    "bedroom_window_check": ["window_count_per_bedroom"],
    "setback_compliance": ["roof_area_sqft", "zone_classification"],
}

CLAIM_CHECKS: dict[str, list[str]] = {
    "trip_cancel_72hr_notice": ["claim_incident_date", "notice_hours"],
    "pre_existing_exclusion": ["coverage_section_match", "pre_existing_flag"],
}


def score_values(case: CaseInput) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for name, field in case.extracted_values.items():
        out[name] = {
            "value": field.value,
            "confidence": round(field.confidence, 4),
            "source": field.source,
        }
    return out


def score_checks(case: CaseInput) -> dict[str, CheckResult]:
    graph = PERMIT_CHECKS if case.domain == "permit" else CLAIM_CHECKS
    results: dict[str, CheckResult] = {}
    for check_id, deps in graph.items():
        confidences = [_confidence_for(case, dep) for dep in deps]
        if not confidences:
            continue
        check_conf = min(confidences)
        passed = check_conf >= case.automation_threshold and _check_passes(check_id, case)
        results[check_id] = CheckResult(
            passed=passed,
            confidence=round(check_conf, 4),
            depends_on=deps,
            message=_check_message(check_id, passed),
        )
    return results


def application_confidence(checks: dict[str, CheckResult]) -> float:
    if not checks:
        return 0.0
    return round(min(c.confidence for c in checks.values()), 4)


def low_confidence_fields(case: CaseInput) -> list[tuple[str, float]]:
    return [
        (name, field.confidence)
        for name, field in case.extracted_values.items()
        if field.confidence < case.automation_threshold
    ]


def _confidence_for(case: CaseInput, field_name: str) -> float:
    field = case.extracted_values.get(field_name)
    return field.confidence if field else 0.0


def _check_passes(check_id: str, case: CaseInput) -> bool:
    values = {k: v.value for k, v in case.extracted_values.items()}
    if check_id == "bedroom_window_check":
        return int(values.get("window_count_per_bedroom", 0)) >= 1
    if check_id == "setback_compliance":
        zone = values.get("zone_classification")
        area = values.get("roof_area_sqft", 0)
        return zone != "R1" or float(area) < 500
    if check_id == "trip_cancel_72hr_notice":
        return int(values.get("notice_hours", 999)) <= 72
    if check_id == "pre_existing_exclusion":
        return not bool(values.get("pre_existing_flag", False))
    return True


def _check_message(check_id: str, passed: bool) -> str:
    status = "pass" if passed else "fail"
    return f"{check_id}:{status}"
