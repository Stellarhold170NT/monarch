"""Shared utilities for skill-creator scripts."""

import os
import shutil
from pathlib import Path


def find_opencode() -> str:
    """Locate the opencode binary on disk.

    Tries known installation paths first, then falls back to PATH lookup.
    Returns the absolute path to the opencode executable.
    """
    # Common install locations (Windows)
    candidates = [
        os.path.expandvars(r"%APPDATA%\npm\node_modules\opencode-ai\bin\opencode.exe"),
        os.path.expandvars(r"%LOCALAPPDATA%\npm\node_modules\opencode-ai\bin\opencode.exe"),
    ]
    for candidate in candidates:
        if candidate and os.path.isfile(candidate):
            return candidate

    # Fallback: search PATH
    found = shutil.which("opencode")
    if found:
        return found

    raise FileNotFoundError(
        "opencode binary not found. Install it via: npm install -g opencode-ai"
    )


def parse_skill_md(skill_path: Path) -> tuple[str, str, str]:
    """Parse a SKILL.md file, returning (name, description, full_content)."""
    content = (skill_path / "SKILL.md").read_text(encoding="utf-8")
    lines = content.split("\n")

    if lines[0].strip() != "---":
        raise ValueError("SKILL.md missing frontmatter (no opening ---)")

    end_idx = None
    for i, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            end_idx = i
            break

    if end_idx is None:
        raise ValueError("SKILL.md missing frontmatter (no closing ---)")

    name = ""
    description = ""
    frontmatter_lines = lines[1:end_idx]
    i = 0
    while i < len(frontmatter_lines):
        line = frontmatter_lines[i]
        if line.startswith("name:"):
            name = line[len("name:"):].strip().strip('"').strip("'")
        elif line.startswith("description:"):
            value = line[len("description:"):].strip()
            # Handle YAML multiline indicators (>, |, >-, |-)
            if value in (">", "|", ">-", "|-"):
                continuation_lines: list[str] = []
                i += 1
                while i < len(frontmatter_lines) and (frontmatter_lines[i].startswith("  ") or frontmatter_lines[i].startswith("\t")):
                    continuation_lines.append(frontmatter_lines[i].strip())
                    i += 1
                description = " ".join(continuation_lines)
                continue
            else:
                description = value.strip('"').strip("'")
        i += 1

    return name, description, content
