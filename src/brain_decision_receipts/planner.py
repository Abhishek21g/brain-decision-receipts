from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import yaml

from brain_decision_receipts.models import CaseInput, Manifest, RuleFired


def _bundled_rules_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "rules"
STAGES = ["extract", "score", "rules", "decision"]


def build_manifest(case: CaseInput) -> Manifest:
    if case.domain not in ("permit", "claim"):
        raise ValueError(f"unsupported domain: {case.domain}")
    if not case.documents:
        raise ValueError("case must include at least one document")
    if not case.extracted_values:
        raise ValueError("case must include extracted_values")
    for name, field in case.extracted_values.items():
        if not 0.0 <= field.confidence <= 1.0:
            raise ValueError(f"confidence for {name} must be in [0, 1]")
    return Manifest(
        schema_version="1.0",
        case_id=case.case_id,
        domain=case.domain,
        rules_version=case.rules_version,
        automation_threshold=case.automation_threshold,
        model_version=case.model_version,
        documents=case.documents,
        stages=STAGES.copy(),
        value_fields=sorted(case.extracted_values.keys()),
    )


def load_case(path: Path) -> CaseInput:
    text = path.read_text()
    if path.suffix in {".yaml", ".yml"}:
        data = yaml.safe_load(text)
    else:
        data = json.loads(text)
    return CaseInput.from_dict(data)


def rules_path_for_version(rules_version: str) -> Path:
    path = _bundled_rules_dir() / f"{rules_version}.yaml"
    if not path.exists():
        raise FileNotFoundError(f"no bundled rules for version {rules_version}")
    return path


def load_rules(rules_version: str) -> list[dict[str, Any]]:
    path = rules_path_for_version(rules_version)
    payload = yaml.safe_load(path.read_text())
    return list(payload.get("rules", []))


def evaluate_rules(case: CaseInput, rules: list[dict[str, Any]]) -> list[RuleFired]:
    values = {k: v.value for k, v in case.extracted_values.items()}
    confidences = {k: v.confidence for k, v in case.extracted_values.items()}
    fired: list[RuleFired] = []
    for rule in rules:
        if _matches(rule.get("when", {}), values, confidences, case.domain):
            fired.append(
                RuleFired(
                    id=rule["id"],
                    condition=rule.get("condition", ""),
                    action=rule["then"],
                    mece_bucket=rule.get("mece_bucket", "general"),
                )
            )
    return fired


def _matches(
    when: dict[str, Any],
    values: dict[str, Any],
    confidences: dict[str, float],
    domain: str,
) -> bool:
    if when.get("domain") and when["domain"] != domain:
        return False
    field = when.get("field")
    confidence_below = when.get("confidence_below")
    if field and confidence_below is not None:
        return confidences.get(field, 1.0) < float(confidence_below)
    for key, expected in when.items():
        if key in {"domain", "confidence_below", "field", "gt", "lt", "eq"}:
            continue
        if values.get(key) != expected:
            return False
    if "gt" in when:
        name, bound = when["gt"]
        if not (float(values.get(name, 0)) > float(bound)):
            return False
    if "lt" in when:
        name, bound = when["lt"]
        if not (float(values.get(name, 0)) < float(bound)):
            return False
    if "eq" in when:
        name, expected = when["eq"]
        if values.get(name) != expected:
            return False
    return True


def rule_requires_human_review(fired: list[RuleFired]) -> bool:
    return any(r.action in {"require_human_review", "reject"} for r in fired)
