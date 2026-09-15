"""Split the test modules across CI shards deterministically.

GitHub Actions runs the matrix legs in parallel, so the wall-clock time of the
suite is the time of its slowest shard. Distributing modules by name would put
`test_api.py` and `test_rules.py` on the same leg often enough to matter, so
the modules are packed greedily by test count: the heaviest module goes to the
shard that is currently lightest.

An async test costs far more than a synchronous one: it builds the schema and
talks to Postgres, while a contract test only reads a file. Async tests are
therefore weighted heavier. The weights are a proxy for runtime, not a
measurement, but they need no timing database and keep the split reproducible
for a given commit: the same tree always yields the same assignment, so a
failure can be traced back to a shard.
"""

import argparse
import re
from pathlib import Path


TESTS_DIR = Path(__file__).resolve().parents[1] / "tests"
ASYNC_TEST_DEF = re.compile(r"^\s*async\s+def\s+test_", re.MULTILINE)
SYNC_TEST_DEF = re.compile(r"^\s*def\s+test_", re.MULTILINE)
ASYNC_WEIGHT = 10
SYNC_WEIGHT = 1


def module_weights() -> list[tuple[str, int]]:
    """Return (module, weight) pairs, heaviest first, ties broken by name."""
    weights = []
    for path in sorted(TESTS_DIR.glob("test_*.py")):
        source = path.read_text(encoding="utf-8")
        weight = (
            len(ASYNC_TEST_DEF.findall(source)) * ASYNC_WEIGHT
            + len(SYNC_TEST_DEF.findall(source)) * SYNC_WEIGHT
        )
        weights.append((f"tests.{path.stem}", weight))
    return sorted(weights, key=lambda item: (-item[1], item[0]))


def shard_modules(shard: int, total: int) -> list[str]:
    """Return the modules assigned to `shard` of `total` (1-based)."""
    buckets: list[list[str]] = [[] for _ in range(total)]
    loads = [0] * total
    for module, weight in module_weights():
        target = loads.index(min(loads))
        buckets[target].append(module)
        loads[target] += weight
    return sorted(buckets[shard - 1])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--shard", type=int, required=True, help="1-based shard index")
    parser.add_argument("--total", type=int, required=True, help="number of shards")
    args = parser.parse_args()

    if not 1 <= args.shard <= args.total:
        raise SystemExit(f"shard {args.shard} is outside 1..{args.total}")

    print(" ".join(shard_modules(args.shard, args.total)))


if __name__ == "__main__":
    main()
