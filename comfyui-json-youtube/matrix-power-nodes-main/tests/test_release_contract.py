from __future__ import annotations

import ast
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / "workflows" / "matrix-power-nodes-ai-dataset.json"


class ReleaseContractTests(unittest.TestCase):
    def test_requirements_do_not_replace_comfyui_runtime(self):
        requirements = {
            line.strip().casefold()
            for line in (ROOT / "requirements.txt").read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        }
        self.assertFalse(
            requirements & {"aiohttp", "numpy", "pillow", "torch"}
        )

    def test_dataset_config_has_no_backend_credential_input(self):
        source = (ROOT / "nodes" / "matrix_datasetconfig.py").read_text(
            encoding="utf-8"
        )
        tree = ast.parse(source)
        self.assertNotIn("provider_key_widget", source)
        self.assertNotIn('"api_key"', source)
        self.assertNotIn("'api_key'", source)
        self.assertIsInstance(tree, ast.Module)

    def test_workflow_is_safe_to_distribute(self):
        workflow = json.loads(WORKFLOW.read_text(encoding="utf-8"))
        nodes = workflow["nodes"]
        config = next(node for node in nodes if node["type"] == "MATRIX_DatasetConfig")
        self.assertIs(config["widgets_values"][0], False)
        self.assertEqual(8, sum(node["type"] == "LoadImage" for node in nodes))
        for node in nodes:
            if node["type"] == "LoadImage":
                self.assertEqual("", node["widgets_values"][0])
            if node["type"] == "MATRIX_DatasetImage":
                self.assertEqual(1, len(node["widgets_values"]))
        serialized = json.dumps(workflow).casefold()
        self.assertNotIn("data:image/", serialized)
        self.assertNotIn("base64,", serialized)
        self.assertNotIn("api_key", serialized)

    def test_submit_guard_is_present_in_runtime(self):
        cache = (ROOT / "_core" / "cache_semantic" / "__init__.py").read_text(
            encoding="utf-8"
        )
        flow = (ROOT / "_core" / "flow_api_media" / "__init__.py").read_text(
            encoding="utf-8"
        )
        self.assertIn("O_EXCL", cache)
        self.assertIn("claim_submit", cache)
        self.assertIn("claim_submit", flow)
        self.assertNotIn("generation_version", flow)
        self.assertIn("duplicate this prompt node", flow)


if __name__ == "__main__":
    unittest.main()
