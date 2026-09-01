from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ReleaseContractTests(unittest.TestCase):
    def test_release_verifier(self):
        completed = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "verify.py")],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)

    def test_showcase_is_safe_and_contains_all_nodes(self):
        workflow = json.loads(
            (ROOT / "workflows" / "matrix-power-nodes-wave1-all-nodes-safe.json").read_text(encoding="utf-8")
        )
        matrix_nodes = [node for node in workflow["nodes"] if str(node.get("type", "")).startswith("MATRIX_Wave1")]
        self.assertEqual(len(matrix_nodes), 10)
        self.assertEqual(len({node["type"] for node in matrix_nodes}), 10)
        self.assertTrue(all(node.get("widgets_values", [None])[0] is False for node in matrix_nodes))
        self.assertNotIn("api_key", json.dumps(workflow).casefold())


if __name__ == "__main__":
    unittest.main()

