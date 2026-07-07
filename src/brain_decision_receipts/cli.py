from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from brain_decision_receipts.doctor import diagnose
from brain_decision_receipts.pipeline import run_pipeline
from brain_decision_receipts.planner import build_manifest, load_case
from brain_decision_receipts.report import export_json, format_report_markdown


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.handler(args)
    except (ValueError, FileNotFoundError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="brain-receipts",
        description="Institutional agent decision receipts for auditable permit/claim casework.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    plan = sub.add_parser("plan", help="Validate a case file and write a run manifest.")
    plan.add_argument("case", type=Path)
    plan.add_argument("--out", type=Path, default=Path(".brain-receipts"))
    plan.set_defaults(handler=_cmd_plan)

    run = sub.add_parser("run", help="Execute the deterministic mock pipeline.")
    run.add_argument("case", type=Path, nargs="?", default=None)
    run.add_argument("--manifest", type=Path, default=None)
    run.add_argument("--out", type=Path, default=Path(".brain-receipts"))
    run.set_defaults(handler=_cmd_run)

    doctor = sub.add_parser("doctor", help="Diagnose a receipt for audit and confidence issues.")
    doctor.add_argument("receipt", type=Path)
    doctor.add_argument("--json", action="store_true", dest="as_json")
    doctor.set_defaults(handler=_cmd_doctor)

    report = sub.add_parser("report", help="Export a receipt summary.")
    report.add_argument("receipt", type=Path)
    report.add_argument("--json", action="store_true", dest="as_json")
    report.add_argument("--out", type=Path, default=None)
    report.set_defaults(handler=_cmd_report)

    return parser


def _cmd_plan(args: argparse.Namespace) -> int:
    case = load_case(args.case)
    manifest = build_manifest(case)
    args.out.mkdir(parents=True, exist_ok=True)
    manifest_path = args.out / "manifest.json"
    manifest_path.write_text(json.dumps(manifest.to_dict(), indent=2) + "\n")
    meta = {"case_path": str(args.case.resolve()), "rules_version_expected": case.rules_version_expected or case.rules_version}
    (args.out / "case.meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(manifest_path)
    return 0


def _cmd_run(args: argparse.Namespace) -> int:
    case_path = args.case
    if case_path is None and args.manifest:
        meta_path = args.manifest.parent / "case.meta.json"
        if meta_path.exists():
            case_path = Path(json.loads(meta_path.read_text())["case_path"])
        else:
            raise ValueError("run requires a case path or manifest with case.meta.json")
    if case_path is None:
        raise ValueError("run requires a case JSON path")
    receipt = run_pipeline(case_path, args.out)
    print(args.out / "receipt.json")
    print(receipt.decision)
    return 0


def _cmd_doctor(args: argparse.Namespace) -> int:
    findings = diagnose(args.receipt)
    if args.as_json:
        print(json.dumps([f.to_dict() for f in findings], indent=2))
    else:
        if not findings:
            print("ok: no findings")
        for finding in findings:
            print(f"[{finding.severity}] {finding.code}: {finding.message}")
            if finding.suggestion:
                print(f"  → {finding.suggestion}")
    return 2 if any(f.severity == "critical" for f in findings) else 0


def _cmd_report(args: argparse.Namespace) -> int:
    payload = export_json(args.receipt) if args.as_json else format_report_markdown(args.receipt)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(payload)
        print(args.out)
    else:
        print(payload, end="" if payload.endswith("\n") else "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
