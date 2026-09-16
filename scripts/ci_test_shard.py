"""Split the test suite across CI shards deterministically.

GitHub Actions runs the matrix legs in parallel, so the suite costs the time of
its slowest shard. Splitting by module is not enough: `tests/test_api.py` alone
holds 56 async tests in a single class, which would pin one shard well above
the rest. The unit of distribution is therefore the individual test method.

Tests are packed greedily: the heaviest test goes to the shard that is
currently lightest. An async test is weighted far above a synchronous one
because it builds the schema and talks to Postgres, while a contract test only
reads a file. The weights are a proxy for runtime, not a measurement, but they
need no timing database and keep the split reproducible for a given tree, so a
failure can always be traced back to a shard.

The test names are parsed from the source rather than imported, so the split
works without the project's dependencies installed.
"""

import argparse
import re
from pathlib import Path


TESTS_DIR = Path(__file__).resolve().parents[1] / "tests"
CLASS_DEF = re.compile(r"^class\s+(\w+)\s*\(")
TEST_DEF = re.compile(r"^\s+(async\s+)?def\s+(test_\w+)\s*\(")
ASYNC_WEIGHT = 10
SYNC_WEIGHT = 1


def collect_tests() -> list[tuple[str, int]]:
    """Return (test id, weight) pairs, heaviest first, ties broken by name."""
    tests: list[tuple[str, int]] = []
    for path in sorted(TESTS_DIR.glob("test_*.py")):
        current_class = None
        for line in path.read_text(encoding="utf-8").splitlines():
            class_match = CLASS_DEF.match(line)
            if class_match:
                current_class = class_match.group(1)
                continue
            test_match = TEST_DEF.match(line)
            if test_match and current_class:
                is_async = bool(test_match.group(1))
                tests.append(
                    (
                        f"tests.{path.stem}.{current_class}.{test_match.group(2)}",
                        ASYNC_WEIGHT if is_async else SYNC_WEIGHT,
                    )
                )
    return sorted(tests, key=lambda item: (-item[1], item[0]))


def shard_tests(shard: int, total: int) -> list[str]:
    """Return the test ids assigned to `shard` of `total` (1-based)."""
    buckets: list[list[str]] = [[] for _ in range(total)]
    loads = [0] * total
    for test_id, weight in collect_tests():
        target = loads.index(min(loads))
        buckets[target].append(test_id)
        loads[target] += weight
    return sorted(buckets[shard - 1])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--shard", type=int, required=True, help="1-based shard index")
    parser.add_argument("--total", type=int, required=True, help="number of shards")
    args = parser.parse_args()

    if not 1 <= args.shard <= args.total:
        raise SystemExit(f"shard {args.shard} is outside 1..{args.total}")

    print(" ".join(shard_tests(args.shard, args.total)))


if __name__ == "__main__":
    main()
