# API Reference

- `POST /upload/faculty`: upload Google Forms Excel faculty preference response file.
- `POST /upload/subjects?duplicate_policy=reject|merge`: upload `TT Subject Requirement.xlsx`.
- `POST /upload/combined?duplicate_policy=reject|merge`: upload one workbook containing both response and subject-count sheets.
- `POST /allocation/run?hierarchy_mode=bottom-up|top-down`: run allocation.
- `GET /results`: faculty-wise allocation records.
- `GET /statistics`: coverage, priority, admin access, validation, and runtime metrics.
- `GET /validation`: validation checks with `PASS`, `WARNING`, or `FAIL`.
- `POST /override`: queue administrative subject override.
- `POST /swap`: queue faculty swap.
- `POST /manual-correction`: queue manual correction.
- `GET /audit`: audit events for the current run.
- `GET /export/excel`: multi-sheet Excel report.
- `GET /export/pdf`: PDF summary report.
