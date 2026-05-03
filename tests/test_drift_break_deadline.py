from pathlib import Path
import unittest


def _drift_break_source() -> str:
    html = Path(__file__).resolve().parents[1].joinpath("index.html").read_text()
    start = html.index("function driftBreak()")
    end = html.index("function driftRemove()", start)
    return html[start:end]


class DriftBreakDeadlineTest(unittest.TestCase):
    def test_drift_break_preserves_existing_deadline(self):
        source = _drift_break_source()

        self.assertIn("?{day:base.deadline.day,hour:base.deadline.hour}", source)
        self.assertNotIn("Math.max(d,base.deadline.day)", source)
        self.assertNotIn("Math.min(base.deadline.day,d+1)", source)


if __name__ == "__main__":
    unittest.main()
