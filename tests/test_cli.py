from __future__ import annotations

import json
from pathlib import Path

from brain_decision_receipts.cli import main


ROOT = Path(__file__).resolve().parents[1]


def test_cli_plan_run_doctor_report(tmp_path: Path, capsys):
    case = ROOT / "scenarios" / "permit-auto-approve.json"
    out = tmp_path / "work"
    assert main(["plan", str(case), "--out", str(out)]) == 0
    assert (out / "manifest.json").exists()
    assert main(["run", str(case), "--out", str(out)]) == 0
    receipt = out / "receipt.json"
    assert receipt.exists()
    assert main(["doctor", str(receipt)]) == 0
    assert main(["report", str(receipt), "--json", "--out", str(out / "out.json")]) == 0
    data = json.loads((out / "out.json").read_text())
    assert data["decision"] == "auto_approve"


def test_cli_doctor_exits_2_on_critical(tmp_path: Path):
    run_out = tmp_path / "claim"
    case = ROOT / "scenarios" / "claim-rules-mismatch.json"
    main(["run", str(case), "--out", str(run_out)])
    code = main(["doctor", str(run_out / "receipt.json")])
    assert code == 2
