#!/usr/bin/env python3

from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CAP_ROOT = ROOT / "plan" / "capabilities"
ALLOWED_DOMAINS = {
    "operator",
    "auth",
    "crud",
    "security",
    "logics",
    "storage",
    "sdk",
    "mcp",
}
VALID_STATUSES = {"planned", "in_progress", "implemented"}

REQUIRED_SECTIONS = [
    "## Intent",
    "## Execution Semantics",
    "## Observable Outcome",
    "## Usage",
    "## Acceptance Criteria",
    "## Failure Modes",
]


@dataclass
class ValidationIssue:
    code: str
    path: Path
    message: str
    hint: str | None = None


@dataclass
class CapabilityDoc:
    path: Path
    domain: str
    cap_id: str
    status: str
    depends: list[str]
    spec_refs: list[str]
    test_refs: list[str]
    code_refs: list[str]
    body: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate capability documents.")
    parser.add_argument(
        "--relaxed-status",
        action="store_true",
        help="Skip status rules (planned/in_progress/implemented field cardinality checks).",
    )
    return parser.parse_args()


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


def read_body(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    try:
        end = next(i for i in range(1, len(lines)) if lines[i].strip() == "---")
    except StopIteration:
        return ""
    return "\n".join(lines[end + 1 :])


def find_scalar(frontmatter: list[str], key: str) -> str | None:
    pattern = re.compile(rf"^{re.escape(key)}:\s*(.+)\s*$")
    for line in frontmatter:
        matched = pattern.match(line)
        if matched:
            return matched.group(1).strip()
    return None


def find_inline_list(frontmatter: list[str], key: str) -> list[str]:
    raw = find_scalar(frontmatter, key)
    if raw is None or raw == "[]":
        return []
    matched = re.match(r"^\[(.*)\]$", raw)
    if not matched:
        return []
    body = matched.group(1).strip()
    if not body:
        return []
    items: list[str] = []
    for part in body.split(","):
        item = part.strip().strip('"').strip("'")
        if item:
            items.append(item)
    return items


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


def load_capability(path: Path) -> CapabilityDoc:
    frontmatter = read_frontmatter(path)
    body = read_body(path)
    domain = path.parent.name
    cap_id = (find_scalar(frontmatter, "id") or "").strip().strip('"').strip("'")
    status = (find_scalar(frontmatter, "status") or "").strip().strip('"').strip("'")
    depends = find_inline_list(frontmatter, "depends")
    spec_refs = find_inline_list(frontmatter, "spec_refs")
    test_refs = find_block_list(frontmatter, "test_refs")
    code_refs = find_block_list(frontmatter, "code_refs")
    return CapabilityDoc(
        path=path,
        domain=domain,
        cap_id=cap_id,
        status=status,
        depends=depends,
        spec_refs=spec_refs,
        test_refs=test_refs,
        code_refs=code_refs,
        body=body,
    )


def check_nodeid(nodeid: str, issues: list[ValidationIssue], file_path: Path) -> None:
    if "::" not in nodeid:
        issues.append(
            ValidationIssue(
                code="TEST_NODEID_INVALID",
                path=file_path,
                message=f"invalid test nodeid (missing ::): {nodeid}",
                hint="Use format tests/integration_py/tests/<file>.py::test_name",
            )
        )
        return
    test_file_raw, test_name = nodeid.split("::", 1)
    test_file = (ROOT / test_file_raw).resolve()
    if not test_file.exists():
        issues.append(
            ValidationIssue(
                code="TEST_FILE_MISSING",
                path=file_path,
                message=f"test file does not exist: {test_file_raw}",
                hint="Update test_refs or add the missing test file",
            )
        )
        return
    content = test_file.read_text(encoding="utf-8")
    pattern = re.compile(rf"^def\s+{re.escape(test_name)}\s*\(", re.MULTILINE)
    if not pattern.search(content):
        issues.append(
            ValidationIssue(
                code="TEST_FUNCTION_MISSING",
                path=file_path,
                message=f"test function not found in {test_file_raw}: {test_name}",
                hint="Rename test_refs entry or create the expected test function",
            )
        )


def check_ref_exists(
    ref: str, issues: list[ValidationIssue], file_path: Path, field: str
) -> None:
    target = ref.split("#", 1)[0]
    abs_target = (ROOT / target).resolve()
    if not abs_target.exists():
        issues.append(
            ValidationIssue(
                code="REF_MISSING",
                path=file_path,
                message=f"{field} target does not exist: {ref}",
                hint="Fix path in frontmatter or create the referenced file/directory",
            )
        )


def check_depends(
    depends: list[str],
    all_ids: set[str],
    issues: list[ValidationIssue],
    file_path: Path,
) -> None:
    for dep in depends:
        if not re.match(r"^[A-Z]+-\d{3}$", dep):
            issues.append(
                ValidationIssue(
                    code="DEPENDS_FORMAT",
                    path=file_path,
                    message=f"invalid depends id format: {dep}",
                    hint="Use DOMAIN-NNN format, for example AUTH-003",
                )
            )
        elif dep not in all_ids:
            issues.append(
                ValidationIssue(
                    code="DEPENDS_UNKNOWN",
                    path=file_path,
                    message=f"depends references unknown capability: {dep}",
                    hint="Add the referenced capability file or fix the id",
                )
            )


def check_body_sections(
    body: str, issues: list[ValidationIssue], file_path: Path
) -> None:
    for section in REQUIRED_SECTIONS:
        if section not in body:
            issues.append(
                ValidationIssue(
                    code="SECTION_MISSING",
                    path=file_path,
                    message=f"missing required section: {section}",
                )
            )

    if "## Acceptance Criteria" in body:
        ac_start = body.index("## Acceptance Criteria")
        ac_rest = body[ac_start:]
        next_section = re.search(r"\n## ", ac_rest[1:])
        ac_block = ac_rest[: next_section.start() + 1] if next_section else ac_rest
        if "- [ ]" not in ac_block:
            issues.append(
                ValidationIssue(
                    code="ACCEPTANCE_FORMAT",
                    path=file_path,
                    message="Acceptance Criteria must use '- [ ]' checklist format",
                )
            )


def validate_file(
    doc: CapabilityDoc,
    issues: list[ValidationIssue],
    all_ids: set[str],
    strict_status: bool,
) -> None:
    path = doc.path
    domain = doc.domain

    if domain not in ALLOWED_DOMAINS:
        issues.append(
            ValidationIssue(
                code="DOMAIN_INVALID",
                path=path,
                message=f"invalid domain directory: {domain}",
            )
        )
        return

    if not re.match(r"^[A-Z]+-\d{3}$", doc.cap_id):
        issues.append(
            ValidationIssue(
                code="ID_FORMAT",
                path=path,
                message=f"invalid id format: {doc.cap_id}",
            )
        )

    expected_prefix = domain.upper()
    if doc.cap_id and not doc.cap_id.startswith(expected_prefix + "-"):
        issues.append(
            ValidationIssue(
                code="ID_DOMAIN_MISMATCH",
                path=path,
                message=f"id/domain mismatch: {doc.cap_id} vs {domain}",
            )
        )

    file_prefix = path.stem.split("-", 2)
    if len(file_prefix) < 3:
        issues.append(
            ValidationIssue(
                code="FILENAME_FORMAT",
                path=path,
                message="file name must be {ID}-{slug}.md",
            )
        )
    else:
        file_id = f"{file_prefix[0]}-{file_prefix[1]}"
        if file_id != doc.cap_id:
            issues.append(
                ValidationIssue(
                    code="FILENAME_ID_MISMATCH",
                    path=path,
                    message="file id prefix does not match frontmatter id",
                )
            )

    fm_domain = (
        (find_scalar(read_frontmatter(path), "domain") or "")
        .strip()
        .strip('"')
        .strip("'")
    )
    if fm_domain != domain:
        issues.append(
            ValidationIssue(
                code="FRONTMATTER_DOMAIN_MISMATCH",
                path=path,
                message=f"frontmatter domain mismatch: {fm_domain} vs {domain}",
            )
        )

    if doc.status not in VALID_STATUSES:
        issues.append(
            ValidationIssue(
                code="STATUS_INVALID",
                path=path,
                message=f"invalid status: {doc.status}",
                hint="Use one of planned, in_progress, implemented",
            )
        )

    for ref in doc.spec_refs:
        check_ref_exists(ref, issues, path, "spec_refs")

    for ref in doc.code_refs:
        check_ref_exists(ref, issues, path, "code_refs")

    for nodeid in doc.test_refs:
        check_nodeid(nodeid, issues, path)

    check_depends(doc.depends, all_ids, issues, path)

    if strict_status:
        if doc.status == "planned":
            if doc.test_refs:
                issues.append(
                    ValidationIssue(
                        code="STATUS_PLANNED_HAS_TESTS",
                        path=path,
                        message="planned capability must have empty test_refs",
                        hint="Either clear test_refs or move status to in_progress/implemented",
                    )
                )
            if doc.code_refs:
                issues.append(
                    ValidationIssue(
                        code="STATUS_PLANNED_HAS_CODE",
                        path=path,
                        message="planned capability must have empty code_refs",
                        hint="Either clear code_refs or move status to in_progress/implemented",
                    )
                )
        elif doc.status == "implemented":
            if not doc.test_refs:
                issues.append(
                    ValidationIssue(
                        code="STATUS_IMPLEMENTED_MISSING_TESTS",
                        path=path,
                        message="implemented requires non-empty test_refs",
                        hint="Add at least one pytest nodeid",
                    )
                )
            if not doc.code_refs:
                issues.append(
                    ValidationIssue(
                        code="STATUS_IMPLEMENTED_MISSING_CODE",
                        path=path,
                        message="implemented requires non-empty code_refs",
                        hint="Add implementation path references",
                    )
                )

    check_body_sections(doc.body, issues, path)


def collect_capability_docs(
    md_files: list[Path], issues: list[ValidationIssue]
) -> list[CapabilityDoc]:
    docs: list[CapabilityDoc] = []
    for md in md_files:
        if md.name == "README.md":
            continue
        try:
            docs.append(load_capability(md))
        except Exception as exc:
            issues.append(
                ValidationIssue(
                    code="PARSE_ERROR",
                    path=md,
                    message=f"unexpected parse error: {exc}",
                )
            )
    return docs


def collect_all_ids(docs: list[CapabilityDoc]) -> set[str]:
    return {doc.cap_id for doc in docs if doc.cap_id}


def print_issues(issues: list[ValidationIssue]) -> None:
    print("Capability validation failed:")
    by_code: dict[str, int] = {}
    for issue in issues:
        by_code[issue.code] = by_code.get(issue.code, 0) + 1
        print(f"- [{issue.code}] {issue.path}: {issue.message}")
        if issue.hint:
            print(f"  hint: {issue.hint}")

    summary = ", ".join(f"{code}={count}" for code, count in sorted(by_code.items()))
    print(f"\nTotal issues: {len(issues)} ({summary})")


def main() -> int:
    args = parse_args()
    strict_status = not args.relaxed_status

    if not CAP_ROOT.exists():
        print(f"Capability root not found: {CAP_ROOT}")
        return 1

    md_files = sorted(CAP_ROOT.glob("**/*.md"))
    issues: list[ValidationIssue] = []
    docs = collect_capability_docs(md_files, issues)
    all_ids = collect_all_ids(docs)

    for doc in docs:
        validate_file(doc, issues, all_ids, strict_status)

    if issues:
        print_issues(issues)
        return 1

    mode = "strict" if strict_status else "relaxed"
    print(
        f"Capability validation passed ({len(md_files)} markdown files checked, mode={mode})."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
