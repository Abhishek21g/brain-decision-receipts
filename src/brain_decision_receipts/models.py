from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal


Domain = Literal["permit", "claim"]
Decision = Literal["auto_approve", "human_review", "reject"]
Severity = Literal["critical", "warning", "info"]


@dataclass
class ValueField:
    value: Any
    confidence: float
    source: str = "mock_extract"


@dataclass
class CheckResult:
    passed: bool
    confidence: float
    depends_on: list[str]
    message: str = ""


@dataclass
class RuleFired:
    id: str
    condition: str
    action: str
    mece_bucket: str


@dataclass
class HumanReviewItem:
    field: str
    reason: str
    confidence: float


@dataclass
class StageRecord:
    name: str
    status: str
    detail: str = ""


@dataclass
class CaseInput:
    case_id: str
    domain: Domain
    rules_version: str
    automation_threshold: float
    model_version: str
    documents: list[str]
    extracted_values: dict[str, ValueField]
    session_recall_used: bool = False
    poisoned_context_detected: bool = False
    rules_version_expected: str | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> CaseInput:
        values = {
            key: ValueField(
                value=item["value"],
                confidence=float(item["confidence"]),
                source=item.get("source", "mock_extract"),
            )
            for key, item in data["extracted_values"].items()
        }
        return cls(
            case_id=data["case_id"],
            domain=data["domain"],
            rules_version=data["rules_version"],
            automation_threshold=float(data.get("automation_threshold", 0.85)),
            model_version=data.get("model_version", "synthetic-v0.1"),
            documents=list(data.get("documents", [])),
            extracted_values=values,
            session_recall_used=bool(data.get("session_recall_used", False)),
            poisoned_context_detected=bool(data.get("poisoned_context_detected", False)),
            rules_version_expected=data.get("rules_version_expected"),
        )


@dataclass
class Manifest:
    schema_version: str
    case_id: str
    domain: Domain
    rules_version: str
    automation_threshold: float
    model_version: str
    documents: list[str]
    stages: list[str]
    value_fields: list[str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Receipt:
    schema_version: str = "1.0"
    case_id: str = ""
    domain: Domain = "permit"
    rules_version: str = ""
    model_version: str = ""
    stages: list[StageRecord] = field(default_factory=list)
    value_confidence: dict[str, dict[str, Any]] = field(default_factory=dict)
    check_confidence: dict[str, dict[str, Any]] = field(default_factory=dict)
    application_confidence: float = 0.0
    automation_threshold: float = 0.85
    decision: Decision = "human_review"
    rules_fired: list[RuleFired] = field(default_factory=list)
    human_review_queue: list[HumanReviewItem] = field(default_factory=list)
    audit_trail_complete: bool = False
    session_recall_used: bool = False
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["rules_fired"] = [asdict(r) for r in self.rules_fired]
        data["human_review_queue"] = [asdict(r) for r in self.human_review_queue]
        data["stages"] = [asdict(s) for s in self.stages]
        return data


@dataclass
class Finding:
    severity: Severity
    code: str
    message: str
    suggestion: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
