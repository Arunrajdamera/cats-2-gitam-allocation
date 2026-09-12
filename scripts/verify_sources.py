from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from pathlib import Path

from app.core import AllocationConfig, build_statistics, export_excel, export_pdf_summary, load_faculty_preferences, load_subject_requirements, run_allocation


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--faculty", required=True)
    parser.add_argument("--subjects", required=True)
    parser.add_argument("--out-dir", default="sample_data")
    parser.add_argument("--duplicate-policy", choices=["reject", "merge"], default="merge")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    config = AllocationConfig(duplicate_subject_policy=args.duplicate_policy)
    faculty, faculty_issues = load_faculty_preferences(args.faculty)
    subjects, subject_issues = load_subject_requirements(args.subjects, config)
    run = run_allocation(faculty, subjects, config, faculty_issues + subject_issues)
    excel_path = export_excel(run, out_dir / "verified_allocation_report.xlsx")
    pdf_path = export_pdf_summary(run, out_dir / "verified_allocation_summary.pdf")
    summary = {
        "faculty_count": len(faculty),
        "subject_count": len(subjects),
        "section_count": sum(subject.capacity for subject in subjects.values()),
        "statistics": build_statistics(run),
        "validation": [asdict(issue) for issue in run.validation],
        "excel_report": str(excel_path),
        "pdf_report": str(pdf_path),
    }
    (out_dir / "verification_summary.json").write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
    print(json.dumps(summary["statistics"], indent=2))


if __name__ == "__main__":
    main()
