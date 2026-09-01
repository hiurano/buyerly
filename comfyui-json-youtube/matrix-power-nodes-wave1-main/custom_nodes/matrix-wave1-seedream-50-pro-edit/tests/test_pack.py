"""Generated pack-level wiring guarantees."""
import ast
from pathlib import Path
import unittest

root = Path(__file__).resolve().parents[1]


class PackWiringTests(unittest.TestCase):
    def test_declared_nodes_are_registered(self):
        pack_source = (root / "__init__.py").read_text(encoding="utf-8")
        ast.parse(pack_source, filename=str(root / "__init__.py"))
        for node_id, module in {'MATRIX_Wave1Seedream50ProEdit': 'matrix_wave1seedream50proedit'}.items():
            node_source = root / "nodes" / f"{module}.py"
            self.assertTrue(node_source.is_file(), node_source)
            source = node_source.read_text(encoding="utf-8")
            ast.parse(source, filename=str(node_source))
            self.assertIn(f"NODE_ID = {node_id!r}", source)
            self.assertIn(f"from .nodes.{module} import", pack_source)

    def test_route_widget_order_is_published(self):
        expected = {'MATRIX_Wave1Seedream50ProEdit': ['prompt', 'images', 'aspect_ratio', 'output_format', 'resolution']}
        for node_id, route_names in expected.items():
            module = {'MATRIX_Wave1Seedream50ProEdit': 'matrix_wave1seedream50proedit'}[node_id]
            source = (root / "nodes" / f"{module}.py").read_text(
                encoding="utf-8"
            )
            positions = []
            for name in route_names:
                candidates = [
                    position
                    for position in (
                        source.find(repr(name)),
                        source.find(f'"{name}"'),
                    )
                    if position >= 0
                ]
                self.assertTrue(candidates, f"missing widget {name} in {module}")
                positions.append(min(candidates))
            self.assertEqual(positions, sorted(positions))

    def test_resolved_blocks_are_present_and_parse(self):
        for slug in ['auth_provider_key', 'spend_admission', 'errors_taxonomy', 'transport_http', 'media_reference_set', 'media_image_in', 'submit_billable', 'submit_sync', 'poll_task', 'media_image_out', 'cache_semantic', 'route_multi', 'ui_progress', 'flow_api_media', 'ui_key_mask', 'ui_appearance']:
            source = root / "_core" / slug / "__init__.py"
            self.assertTrue(source.is_file(), source)
            ast.parse(source.read_text(encoding="utf-8"), filename=str(source))


if __name__ == "__main__":
    unittest.main()
