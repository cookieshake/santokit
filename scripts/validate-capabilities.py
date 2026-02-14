#!/usr/bin/env python3

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CAP_ROOT = ROOT / "plan" / "capabilities"
ALLOWED_DOMAINS = {"operator", "auth", "crud", "security", "logics"}


def read_frontmatter(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if len(lines) < 3 or lines[0].strip() != "---":
        raise ValueError("missing frontmatter start marker")
    try:
        end = next(i for i in range(1, len(lines)) if lines[i].strip() == "---")
    except StopIteration as exc:
        raise ValueError("missing frontmatter end marker") from exc
    return lines[1:end]


def find_scalar(frontmatter: list[str], key: str) -> str | None:
    pattern = re.compile(rf"^{re.escape(key)}:\s*(.+)\s*$")
    for line in frontmatter:
        m = pattern.match(line)
        if m:
            return m.group(1).strip()
    return None


def find_inline_list(frontmatter: list[str], key: str) -> list[str]:
    raw = find_scalar(frontmatter, key)
    if raw is None:
        return []
    if raw == "[]":
        return []
    m = re.match(r"^\[(.*)\]$", raw)
    if not m:
        return []
    body = m.group(1).strip()
    if not body:
        return []
    items = []
    for part in body.split(","):
        item = part.strip().strip('"').strip("'")
        if item:
            items.append(item)
    return items


def find_block_list(frontmatter: list[str], key: str) -> list[str]:
    start = None
    for idx, line in enumerate(frontmatter):
        if re.match(rf"^{re.escape(key)}:\s*$", line):
            start = idx
            break
        if re.match(rf"^{re.escape(key)}:\s*\[\]\s*$", line):
            return []
    if start is None:
        return []

    items: list[str] = []
    for line in frontmatter[start + 1 :]:
        if not line.startswith("  "):
            break
        m = re.match(r"^\s*-\s*(.+)$", line)
        if m:
            items.append(m.group(1).strip().strip('"').strip("'"))
    return items


def has_verify_command(frontmatter: list[str]) -> bool:
    raw = find_scalar(frontmatter, "verify")
    if raw == "[]":
        return False
    in_verify = False
    for line in frontmatter:
        if re.match(r"^verify:\s*$", line):
            in_verify = True
            continue
        if in_verify and not line.startswith("  "):
            break
        if in_verify and re.match(r"^\s*-\s*cmd:\s*.+$", line):
            return True
    return False


def check_nodeid(nodeid: str, errors: list[str], file_path: Path) -> None:
    if "::" not in nodeid:
        errors.append(f"{file_path}: invalid test nodeid (missing ::): {nodeid}")
        return
    test_file_raw, test_name = nodeid.split("::", 1)
    test_file = (ROOT / test_file_raw).resolve()
    if not test_file.exists():
        errors.append(f"{file_path}: test file does not exist: {test_file_raw}")
        return
    content = test_file.read_text(encoding="utf-8")
    pattern = re.compile(rf"^def\s+{re.escape(test_name)}\s*\(", re.MULTILINE)
    if not pattern.search(content):
        errors.append(
            f"{file_path}: test function not found in {test_file_raw}: {test_name}"
        )


def check_ref_exists(ref: str, errors: list[str], file_path: Path, field: str) -> None:
    target = ref.split("#", 1)[0]
    abs_target = (ROOT / target).resolve()
    if not abs_target.exists():
        errors.append(f"{file_path}: {field} target does not exist: {ref}")


def validate_file(path: Path, errors: list[str]) -> None:
    if path.name == "README.md" and path.parent == CAP_ROOT:
        return

    domain = path.parent.name
    if domain not in ALLOWED_DOMAINS:
        errors.append(f"{path}: invalid domain directory: {domain}")
        return
    if path.name == "README.md":
        return

    frontmatter = read_frontmatter(path)

    cap_id = (find_scalar(frontmatter, "id") or "").strip().strip('"').strip("'")
    status = (find_scalar(frontmatter, "status") or "").strip().strip('"').strip("'")
    fm_domain = (find_scalar(frontmatter, "domain") or "").strip().strip('"').strip("'")

    if not re.match(r"^[A-Z]+-\d{3}$", cap_id):
        errors.append(f"{path}: invalid id format: {cap_id}")

    expected_prefix = domain.upper()
    if cap_id and not cap_id.startswith(expected_prefix + "-"):
        errors.append(f"{path}: id/domain mismatch: {cap_id} vs {domain}")

    if fm_domain != domain:
        errors.append(f"{path}: frontmatter domain mismatch: {fm_domain} vs {domain}")

    file_prefix = path.stem.split("-", 2)
    if len(file_prefix) < 3:
        errors.append(f"{path}: file name must be {{ID}}-{{slug}}.md")
    else:
        file_id = f"{file_prefix[0]}-{file_prefix[1]}"
        if file_id != cap_id:
            errors.append(f"{path}: file id prefix does not match frontmatter id")

    if status not in {"planned", "in_progress", "implemented"}:
        errors.append(f"{path}: invalid status: {status}")

    flow_refs = find_inline_list(frontmatter, "flow_refs")
    spec_refs = find_inline_list(frontmatter, "spec_refs")
    test_refs = find_block_list(frontmatter, "test_refs")
    code_refs = find_block_list(frontmatter, "code_refs")

    if not flow_refs:
        errors.append(f"{path}: flow_refs must not be empty")
    for ref in flow_refs:
        check_ref_exists(ref, errors, path, "flow_refs")

    if not spec_refs:
        errors.append(f"{path}: spec_refs must not be empty")
    for ref in spec_refs:
        check_ref_exists(ref, errors, path, "spec_refs")

    if not code_refs:
        errors.append(f"{path}: code_refs must not be empty")
    for ref in code_refs:
        check_ref_exists(ref, errors, path, "code_refs")

    for nodeid in test_refs:
        check_nodeid(nodeid, errors, path)

    if status == "implemented":
        if not test_refs:
            errors.append(f"{path}: implemented requires non-empty test_refs")
        if not has_verify_command(frontmatter):
            errors.append(f"{path}: implemented requires at least one verify cmd")


def main() -> int:
    if not CAP_ROOT.exists():
        print(f"Capability root not found: {CAP_ROOT}")
        return 1

    md_files = sorted(CAP_ROOT.glob("**/*.md"))
    errors: list[str] = []

    for md in md_files:
        try:
            validate_file(md, errors)
        except Exception as exc:  # pragma: no cover
            errors.append(f"{md}: unexpected parse error: {exc}")

    if errors:
        print("Capability validation failed:")
        for err in errors:
            print(f"- {err}")
        return 1

    print(f"Capability validation passed ({len(md_files)} markdown files checked).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
