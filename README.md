# Institutional Agent Decision Receipts

Audit-grade decision receipts for regulated casework — inspired by Brain Co.'s public writing on Bayesian confidence scoring and LLM-generated rules engines. **Not affiliated with Brain Co.** Synthetic mock pipeline only.

## Quick start

```bash
pip install -e ".[dev]"

brain-receipts plan scenarios/permit-auto-approve.json
brain-receipts run  .brain-receipts/manifest.json
brain-receipts doctor .brain-receipts/receipt.json
brain-receipts report .brain-receipts/receipt.json --json > examples/permit-receipt.json
pytest
```

## Commands

| Command | Purpose |
|---------|---------|
| `plan` | Validate case JSON → write manifest |
| `run` | Deterministic `extract → score → rules → decision` pipeline |
| `doctor` | Flag low confidence, rules drift, audit gaps, poisoned recall |
| `report` | Export receipt JSON or markdown summary |

## Bundled scenarios

- `scenarios/permit-auto-approve.json` — high confidence → auto approve
- `scenarios/permit-human-review.json` — low field confidence → human review
- `scenarios/claim-rules-mismatch.json` — rules drift + exclusion fires

## Demo

Multi-page workbench (benchmark: [Trust Me Bro](https://trust-me-bro-mu.vercel.app/) quality bar):

- **Dashboard** — charts, heatmap, scenario library
- **Live Runner** — animated `plan → run` pipeline + receipt inspector
- **The Vision** — product narrative

https://enaguthi.com/brain-decision-receipts/site/

## License

MIT
