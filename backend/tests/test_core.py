import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from app.core.allocator import run_allocation
from app.core.parsers import load_subject_requirements, synthetic_subject_code
from app.core.schemas import AllocationConfig, Faculty, Subject, ValidationStatus
import openpyxl


class CoreAllocationTests(unittest.TestCase):
    def test_reaches_full_coverage_with_admin_access(self):
        faculty = [
            Faculty("1", "Professor A", "Professor", ["CSEN1"], "HOD"),
            Faculty("2", "Assistant B", "Assistant Professor", ["CSEN1"]),
        ]
        subjects = {"CSEN1": Subject("CSEN1", "Operating Systems", 3)}
        run = run_allocation(faculty, subjects, AllocationConfig(enable_admin_access=True, max_supplemental_allocations=2))
        self.assertEqual(sum(run.remaining_capacity.values()), 0)
        self.assertTrue(any(issue.check == "subject_coverage" and issue.status == ValidationStatus.PASS for issue in run.validation))
        unique = {(a.emp_id, a.subject_code, a.slot) for r in run.faculty for a in r.allocations}
        self.assertEqual(len(unique), sum(len(r.allocations) for r in run.faculty))

    def test_missing_preference_generates_manual_queue(self):
        faculty = [Faculty("1", "Faculty A", "Assistant Professor", [None, None, None, None, None])]
        subjects = {"CSEN1": Subject("CSEN1", "Operating Systems", 1)}
        run = run_allocation(faculty, subjects, AllocationConfig(enable_admin_access=False))
        self.assertEqual(run.faculty[0].status, "MANUAL ALLOCATION REQUIRED")
        self.assertTrue(any(issue.check == "missing_preferences" for issue in run.validation))

    def test_synthetic_subject_code_handles_dash_variants(self):
        self.assertEqual(synthetic_subject_code("Combinatorial Optimization (PC)"), "AUTO_COMBINATORIAL_OPTIMIZATION")
        self.assertEqual(synthetic_subject_code("Combinatorial Optimization - PG I"), "AUTO_COMBINATORIAL_OPTIMIZATION")
        self.assertEqual(synthetic_subject_code("Combinatorial Optimization \u2013 PG I"), "AUTO_COMBINATORIAL_OPTIMIZATION")

    def test_missing_combinatorial_master_row_is_generated(self):
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "subjects.xlsx"
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.append(["Title"])
            ws.append(["Semester", "L", "T", "P", "S", "J", "C", "Course Category", "Course Codes", "Courses", "Instructors"])
            for _ in range(46):
                ws.append([])
            ws.append(["PG I", 3, 1, 0, 0, 0, 4, "PC", None, None, 1])
            wb.save(path)
            subjects, issues = load_subject_requirements(path, AllocationConfig(duplicate_subject_policy="merge"))
            self.assertIn("AUTO_COMBINATORIAL_OPTIMIZATION", subjects)
            subject = subjects["AUTO_COMBINATORIAL_OPTIMIZATION"]
            self.assertEqual(subject.name, "Combinatorial Optimization")
            self.assertEqual(subject.weekly_classes, 5)
            self.assertEqual(subject.partner_workload, 2)
            self.assertTrue(any(issue.check == "missing_subject_definition" for issue in issues))

    def test_bottom_up_order_gets_first_access_to_capacity(self):
        faculty = [
            Faculty("top", "Top Faculty", "Assistant Professor", ["CSEN1"], source_row=2, preference_ranks=[1]),
            Faculty("bottom", "Bottom Faculty", "Assistant Professor", ["CSEN1"], source_row=3, preference_ranks=[1]),
        ]
        subjects = {"CSEN1": Subject("CSEN1", "Operating Systems", 1, credits=3, weekly_classes=3)}
        run = run_allocation(faculty, subjects, AllocationConfig(enable_admin_access=False))
        bottom = next(result for result in run.faculty if result.emp_id == "bottom")
        top = next(result for result in run.faculty if result.emp_id == "top")
        self.assertEqual(len(bottom.allocations), 1)
        self.assertEqual(len(top.allocations), 0)
        self.assertEqual(sum(run.remaining_capacity.values()), 0)


if __name__ == "__main__":
    unittest.main()
