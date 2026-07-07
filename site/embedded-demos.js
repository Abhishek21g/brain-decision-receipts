window.EMBEDDED_DEMOS = {
  "permit-auto-approve.json": {
    "schema_version": "1.0",
    "case_id": "permit-001",
    "domain": "permit",
    "rules_version": "zoning-r1-2026.01",
    "model_version": "synthetic-v0.1",
    "stages": [
      {
        "name": "extract",
        "status": "ok",
        "detail": "2 documents"
      },
      {
        "name": "score",
        "status": "ok",
        "detail": "3 value nodes"
      },
      {
        "name": "score",
        "status": "ok",
        "detail": "application_confidence=0.91"
      },
      {
        "name": "rules",
        "status": "ok",
        "detail": "1 rules fired"
      },
      {
        "name": "decision",
        "status": "ok",
        "detail": "auto_approve"
      }
    ],
    "value_confidence": {
      "roof_area_sqft": {
        "value": 420,
        "confidence": 0.94,
        "source": "blueprint_extract"
      },
      "zone_classification": {
        "value": "R1",
        "confidence": 0.92,
        "source": "form_extract"
      },
      "window_count_per_bedroom": {
        "value": 2,
        "confidence": 0.91,
        "source": "blueprint_extract"
      }
    },
    "check_confidence": {
      "bedroom_window_check": {
        "passed": true,
        "confidence": 0.91,
        "depends_on": [
          "window_count_per_bedroom"
        ],
        "message": "bedroom_window_check:pass"
      },
      "setback_compliance": {
        "passed": true,
        "confidence": 0.92,
        "depends_on": [
          "roof_area_sqft",
          "zone_classification"
        ],
        "message": "setback_compliance:pass"
      }
    },
    "application_confidence": 0.91,
    "automation_threshold": 0.85,
    "decision": "auto_approve",
    "rules_fired": [
      {
        "id": "R-12",
        "condition": "IF zone == R1 AND roof_area_sqft < 500 THEN auto_approve_small_residential",
        "action": "auto_approve",
        "mece_bucket": "residential_small"
      }
    ],
    "human_review_queue": [],
    "audit_trail_complete": true,
    "session_recall_used": false,
    "notes": [
      "synthetic mock pipeline \u2014 not Brain Co. GovOS/InsuranceOS"
    ]
  },
  "claim-rules-mismatch.json": {
    "schema_version": "1.0",
    "case_id": "claim-001",
    "domain": "claim",
    "rules_version": "insurance-trip-cancel-2025.12",
    "model_version": "synthetic-v0.1",
    "stages": [
      {
        "name": "extract",
        "status": "ok",
        "detail": "2 documents"
      },
      {
        "name": "score",
        "status": "ok",
        "detail": "4 value nodes"
      },
      {
        "name": "score",
        "status": "ok",
        "detail": "application_confidence=0.87"
      },
      {
        "name": "rules",
        "status": "ok",
        "detail": "1 rules fired"
      },
      {
        "name": "decision",
        "status": "ok",
        "detail": "reject"
      }
    ],
    "value_confidence": {
      "claim_incident_date": {
        "value": "2026-05-01",
        "confidence": 0.9,
        "source": "form_extract"
      },
      "notice_hours": {
        "value": 48,
        "confidence": 0.88,
        "source": "form_extract"
      },
      "coverage_section_match": {
        "value": "5.1",
        "confidence": 0.87,
        "source": "policy_extract"
      },
      "pre_existing_flag": {
        "value": true,
        "confidence": 0.95,
        "source": "medical_history_extract"
      }
    },
    "check_confidence": {
      "trip_cancel_72hr_notice": {
        "passed": true,
        "confidence": 0.88,
        "depends_on": [
          "claim_incident_date",
          "notice_hours"
        ],
        "message": "trip_cancel_72hr_notice:pass"
      },
      "pre_existing_exclusion": {
        "passed": false,
        "confidence": 0.87,
        "depends_on": [
          "coverage_section_match",
          "pre_existing_flag"
        ],
        "message": "pre_existing_exclusion:fail"
      }
    },
    "application_confidence": 0.87,
    "automation_threshold": 0.85,
    "decision": "reject",
    "rules_fired": [
      {
        "id": "C-11",
        "condition": "IF pre_existing_flag == true THEN reject",
        "action": "reject",
        "mece_bucket": "general_exclusions"
      }
    ],
    "human_review_queue": [],
    "audit_trail_complete": true,
    "session_recall_used": false,
    "notes": [
      "synthetic mock pipeline \u2014 not Brain Co. GovOS/InsuranceOS"
    ]
  },
  "permit-human-review.json": {
    "schema_version": "1.0",
    "case_id": "permit-002",
    "domain": "permit",
    "rules_version": "zoning-r1-2026.01",
    "model_version": "synthetic-v0.1",
    "stages": [
      {
        "name": "extract",
        "status": "ok",
        "detail": "1 documents"
      },
      {
        "name": "score",
        "status": "ok",
        "detail": "3 value nodes"
      },
      {
        "name": "score",
        "status": "ok",
        "detail": "application_confidence=0.62"
      },
      {
        "name": "rules",
        "status": "ok",
        "detail": "2 rules fired"
      },
      {
        "name": "decision",
        "status": "ok",
        "detail": "human_review"
      }
    ],
    "value_confidence": {
      "roof_area_sqft": {
        "value": 410,
        "confidence": 0.93,
        "source": "blueprint_extract"
      },
      "zone_classification": {
        "value": "R1",
        "confidence": 0.9,
        "source": "form_extract"
      },
      "window_count_per_bedroom": {
        "value": 1,
        "confidence": 0.62,
        "source": "blueprint_extract"
      }
    },
    "check_confidence": {
      "bedroom_window_check": {
        "passed": false,
        "confidence": 0.62,
        "depends_on": [
          "window_count_per_bedroom"
        ],
        "message": "bedroom_window_check:fail"
      },
      "setback_compliance": {
        "passed": true,
        "confidence": 0.9,
        "depends_on": [
          "roof_area_sqft",
          "zone_classification"
        ],
        "message": "setback_compliance:pass"
      }
    },
    "application_confidence": 0.62,
    "automation_threshold": 0.85,
    "decision": "human_review",
    "rules_fired": [
      {
        "id": "R-12",
        "condition": "IF zone == R1 AND roof_area_sqft < 500 THEN auto_approve_small_residential",
        "action": "auto_approve",
        "mece_bucket": "residential_small"
      },
      {
        "id": "R-18",
        "condition": "IF window_count confidence below threshold THEN require_human_review",
        "action": "require_human_review",
        "mece_bucket": "bedroom_safety"
      }
    ],
    "human_review_queue": [
      {
        "field": "window_count_per_bedroom",
        "reason": "below automation threshold",
        "confidence": 0.62
      }
    ],
    "audit_trail_complete": true,
    "session_recall_used": false,
    "notes": [
      "synthetic mock pipeline \u2014 not Brain Co. GovOS/InsuranceOS"
    ]
  }
};
