#!/usr/bin/env python3

from __future__ import annotations

import argparse
import re
import shlex
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CAP_ROOT = ROOT / "plan" / "capabilities"
ALLOWED_STATUSES = {"planned", "in_progress", "implemented"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="List pytest nodeids from capability test_refs."
    )
    parser.add_argument(
        "--domain", help="Filter by capability domain (auth, crud, ...)"
    )
    parser.add_argument(
        "--capability", help="Filter by capability id (example: AUTH-001)"
    )
    parser.add_argument(
        "--status",
        action="append",
        help="Filter by status. Can be repeated. Defaults to all statuses.",
    )
    parser.add_argument(
        "--format",
        choices=["plain", "shell"],
        default="plain",
        help="Output format. 'shell' returns space-separated, shell-quoted nodeids.",
    )
    parser.add_argument(
        "--strip-prefix",
        action="append",
        default=[],
        help="Strip this prefix from each nodeid before output. Can be repeated.",
    )
    return parser.parse_args()


def read_frontmatter(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if len(lines) < 3 or lines[0].strip() != "---":
        return []
    try:
        end = next(i for i in range(1, len(lines)) if lines[i].strip() == "---")
    except StopIteration:
        return []
    return lines[1:end]


def find_scalar(frontmatter: list[str], key: str) -> str:
    pattern = re.compile(rf"^{re.escape(key)}:\s*(.+)\s*$")
    for line in frontmatter:
        matched = pattern.match(line)
        if matched:
            return matched.group(1).strip().strip('"').strip("'")
    return ""


def find_block_list(frontmatter: list[str], key: str) -> list[str]:
    start: int | None = None
    for index, line in enumerate(frontmatter):
        if re.match(rf"^{re.escape(key)}:\s*$", line):
            start = index
            break
        if re.match(rf"^{re.escape(key)}:\s*\[\]\s*$", line):
            return []
    if start is None:
        return []

    items: list[str] = []
    for line in frontmatter[start + 1 :]:
        if not line.startswith("  "):
            break
        matched = re.match(r"^\s*-\s*(.+)$", line)
        if matched:
            items.append(matched.group(1).strip().strip('"').strip("'"))
    return items


def iter_capability_files() -> list[Path]:
    files = sorted(CAP_ROOT.glob("**/*.md"))
    return [p for p in files if p.name != "README.md"]


def main() -> int:
    args = parse_args()

    statuses = set(args.status or ALLOWED_STATUSES)
    invalid = sorted(statuses - ALLOWED_STATUSES)
    if invalid:
        print(f"Invalid status filter: {', '.join(invalid)}")
        return 2

    nodeids: set[str] = set()
    for path in iter_capability_files():
        frontmatter = read_frontmatter(path)
        if not frontmatter:
            continue

        cap_id = find_scalar(frontmatter, "id")
        status = find_scalar(frontmatter, "status")
        domain = find_scalar(frontmatter, "domain") or path.parent.name

        if args.domain and domain != args.domain:
            continue
        if args.capability and cap_id != args.capability:
            continue
        if status not in statuses:
            continue

        for nodeid in find_block_list(frontmatter, "test_refs"):
            if nodeid:
                nodeids.add(nodeid)

    normalized: set[str] = set()
    for nodeid in nodeids:
        current = nodeid
        for prefix in args.strip_prefix:
            if current.startswith(prefix):
                current = current[len(prefix) :]
                break
        normalized.add(current)

    ordered = sorted(normalized)
    if args.format == "shell":
        print(" ".join(shlex.quote(nodeid) for nodeid in ordered))
    else:
        for nodeid in ordered:
            print(nodeid)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
