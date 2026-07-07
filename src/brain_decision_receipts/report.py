from __future__ import annotations

import json
from pathlib import Path

from brain_decision_receipts.doctor import load_receipt


def format_report_markdown(receipt_path: Path) -> str:
    receipt = load_receipt(receipt_path)
    lines = [
        f"# Decision receipt — {receipt.case_id}",
        "",
        f"- **Domain:** {receipt.domain}",
        f"- **Decision:** `{receipt.decision}`",
        f"- **Application confidence:** {receipt.application_confidence} (threshold {receipt.automation_threshold})",
        f"- **Rules version:** {receipt.rules_version}",
        f"- **Audit trail complete:** {receipt.audit_trail_complete}",
        "",
        "## Value confidence",
    ]
    for name, node in receipt.value_confidence.items():
        lines.append(f"- `{name}`: {node.get('value')} @ {node.get('confidence')}")
    lines.append("")
    lines.append("## Check confidence")
    for name, node in receipt.check_confidence.items():
        lines.append(
            f"- `{name}`: passed={node.get('passed')} confidence={node.get('confidence')}"
        )
    lines.append("")
    lines.append("## Rules fired")
    if not receipt.rules_fired:
        lines.append("- (none)")
    for rule in receipt.rules_fired:
        lines.append(f"- **{rule.id}**: {rule.condition} → `{rule.action}`")
    lines.append("")
    lines.append("## Human review queue")
    if not receipt.human_review_queue:
        lines.append("- (empty)")
    for item in receipt.human_review_queue:
        lines.append(f"- `{item.field}`: {item.reason} (confidence {item.confidence})")
    lines.append("")
    return "\n".join(lines)


def export_json(receipt_path: Path) -> str:
    receipt = load_receipt(receipt_path)
    return json.dumps(receipt.to_dict(), indent=2) + "\n"
