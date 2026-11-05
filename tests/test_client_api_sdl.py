"""The client API's SDL, as the TypeScript server compares its own schema with it (#611).

packages/shared/client-api.graphql is this schema printed. The TypeScript server's
schema test (server/test/graphql/schema.test.ts) checks every type and field it serves
against the file, so a change here that is not printed into it fails this test, and a
TypeScript field that drifts from it fails that one. To refresh it:

    python -c "from api.client_api import schema; print(schema.as_str())" > packages/shared/client-api.graphql
"""

import unittest
from pathlib import Path

from api.client_api import schema

SDL = Path(__file__).resolve().parent.parent / "packages" / "shared" / "client-api.graphql"


class TestClientApiSdl(unittest.TestCase):
    def test_the_printed_schema_is_current(self):
        self.assertEqual(SDL.read_text().rstrip("\n"), schema.as_str().rstrip("\n"))


if __name__ == "__main__":
    unittest.main()
