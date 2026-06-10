---
name: creating-deep-swe-benchmark-tasks
description: Use when adding new tasks to a DeepSWE benchmark dataset, selecting open-source repos to convert into coding agent evaluation tasks with Docker sandboxing and programmatic verifiers
---

# Creating DeepSWE Benchmark Tasks

## Overview

DeepSWE is a benchmark of 113+ original, long-horizon software engineering tasks across Go, TypeScript, Python, Rust, and JavaScript. Each task lives in `tasks/<task-id>/` with a strict directory structure consumed by the Pier evaluation framework.

**Core principle:** A valid task has 4 mandatory components — metadata (`task.toml`), environment (`environment/Dockerfile`), test harness (`tests/test.sh` + `tests/test.patch`), and reference solution (`solution/solution.patch`).

## Task Directory Structure

```
tasks/<task-id>/
├── task.toml                  # Metadata (required)
├── instruction.md             # Agent prompt (required)
├── environment/
│   └── Dockerfile             # Repo cloning + dependencies (required)
├── tests/
│   ├── test.sh                # Verifier entry point (required)
│   └── test.patch             # Git diff adding test code to repo (required)
└── solution/
    ├── solve.sh               # Solution application script (required)
    └── solution.patch         # Git diff of correct answer (required)
```

### Validation (Pier checks these automatically)

`TaskPaths.is_valid()` returns `True` when:
- `task.toml` exists
- `environment/` directory exists
- `instruction.md` exists
- `tests/test.sh` exists

## How Pier Loads Tasks

```yaml
# In job config (e.g. job_config_monarch_minimax.yaml)
datasets:
  - path: "E:/nt170/VSKILL/deep-swe/tasks"
    task_names:
      - "my-new-task"       # Glob pattern; omit to run all
```

Pier iterates `dataset.path`, reads each subdirectory, validates with `TaskPaths.is_valid()`, and builds `TaskConfig` objects. Tasks can be filtered by `task_names`, excluded by `exclude_task_names`, sampled by `n_tasks`, and shuffled by `sample_seed`.

## Step-by-Step: Creating a New Task

### Step 1: Select a Repo and Base Commit

Pick an open-source project with:
- An active issue or missing feature suitable for a coding agent
- A clear base commit (before the feature was implemented)
- Existing test suite to verify baseline stability

### Step 2: Scaffold the Directory

```
tasks/<task-id>/
```

Use kebab-case for task-id (e.g. `my-tool-new-feature`).

### Step 3: Write `task.toml`

```toml
schema_version = "1.1"
artifacts = []
[task]
name = "datacurve/my-tool-new-feature"
description = ""
authors = []
keywords = []
[metadata]
ext_id = "<generate-unique-id>"          # Used for Docker image tag
task_id = "my-tool-new-feature"
display_title = "Concise display title"
display_description = "Brief explanation of what the task entails"
original_title = "Original issue/feature title"
category = "enhancement"                 # enhancement | bugfix | refactor
language = "go"                          # go | python | typescript | rust | javascript
repository_url = "https://github.com/owner/repo"
base_commit_hash = "<full-commit-hash>"
[verifier]
timeout_sec = 1800.0
[verifier.env]
[agent]
timeout_sec = 5400.0
[environment]
build_timeout_sec = 1800.0
docker_image = "public.ecr.aws/d3j8x8q7/swe-bench-202605:<ext_id>"  # Pre-built image by ext_id
os = "linux"
cpus = 2
memory_mb = 8192
storage_mb = 20480
gpus = 0
allow_internet = false
mcp_servers = []
[environment.env]
[solution.env]
```

### Step 4: Write `instruction.md`

Describe what the agent needs to implement. Structure:
- **Summary** — one-line what to build
- **Expected outcomes** — numbered list of specific deliverables
- **Edge cases** — inputs, errors, boundary conditions
- **API contracts** — function signatures, types, return formats

Keep it unambiguous. Agents don't ask clarifying questions.

### Step 5: Write `environment/Dockerfile`

```dockerfile
FROM public.ecr.aws/x8v8d7g8/mars-base:latest
WORKDIR /app
RUN git clone https://github.com/owner/repo . \
    && git checkout <base-commit> \
    && (git submodule update --init --recursive || true)
RUN <build-commands>    # go mod download, npm install, cargo build, etc.
CMD ["/bin/bash"]
```

### Step 6: Write `tests/test.patch`

This is a git diff that:
1. Adds new test files to the target repository (using the repo's own test framework)
2. Adds `/app/test.sh` — the script Pier runs inside the container

**Pattern by language:**

**Go (Go testing):**
```diff
diff --git a/pkg/mycode/feature_test.go b/pkg/mycode/feature_test.go
new file mode 100644
--- /dev/null
+++ b/pkg/mycode/feature_test.go
@@ -0,0 +1,20 @@
+package mycode
+
+import "testing"
+
+func TestNewFeature(t *testing.T) {
+    result := MyFunction("input")
+    if result != "expected" {
+        t.Fatalf("got %q, want %q", result, "expected")
+    }
+}
```

**Python (pytest):**
```diff
diff --git a/tests/test_new_feature.py b/tests/test_new_feature.py
new file mode 100644
--- /dev/null
+++ b/tests/test_new_feature.py
@@ -0,0 +1,15 @@
+import pytest
+from mypackage import myfunction
+
+def test_basic():
+    assert myfunction("input") == "expected"
+
+@pytest.mark.parametrize("value,expected", [
+    ("", ValueError),
+    ("invalid", None),
+])
+def test_errors(value, expected):
+    if expected is ValueError:
+        with pytest.raises(ValueError):
+            myfunction(value)
```

**Rust (cargo test):**
```diff
diff --git a/crates/mycore/tests/feature.rs b/crates/mycore/tests/feature.rs
new file mode 100644
--- /dev/null
+++ b/crates/mycore/tests/feature.rs
@@ -0,0 +1,10 @@
+#[test]
+fn test_new_feature() {
+    let result = my_function("input");
+    assert_eq!(result, "expected");
+}
+
+#[test]
+fn test_edge_case() {
+    assert!(my_function("").is_err());
+}
```

> **Language note:** Test framework depends on the target repository. The examples below are illustrative — use whatever framework the repo uses (pytest, Go testing, cargo test, Deno, mocha, vitest, jest, etc.).

**TypeScript (Deno test — adapt for mocha/vitest/jest as needed):**
```diff
diff --git a/command/test/feature_test.ts b/command/test/feature_test.ts
new file mode 100644
--- /dev/null
+++ b/command/test/feature_test.ts
@@ -0,0 +1,11 @@
+import { assertEquals, assertRejects } from "@std/assert";
+import { MyClass } from "../mod.ts";
+
+Deno.test("MyClass handles basic input", () => {
+    const result = MyClass.process("input");
+    assertEquals(result, "expected");
+});
+
+Deno.test("MyClass rejects empty input", () => {
+    assertRejects(() => MyClass.process(""));
+});
```

### Step 7: Add `/app/test.sh` to `test.patch`

Every task's `test.patch` must also add an executable `test.sh` at the repo root:

```diff
diff --git a/test.sh b/test.sh
new file mode 100755
--- /dev/null
+++ b/test.sh
@@ -0,0 +1,20 @@
+#!/bin/bash
+set -euo pipefail
+
+mode="${1:-}"
+cd "$(dirname "$0")"
+
+if [ "$mode" = "base" ]; then
+    # Run existing tests to verify baseline stability
+    # Example: go test ./pkg/existing/...
+    # Example: python -m pytest tests/test_existing.py -v --timeout=60
+    # Example: cargo test --lib --quiet
+    echo "Base tests: not required unless verifying no regressions"
+elif [ "$mode" = "new" ]; then
+    # Run only the new tests
+    # Example: go test -run "^TestNewFeature" ./pkg/mycode/...
+    # Example: python -m pytest tests/test_new_feature.py -v --timeout=60
+    # Example: cargo test tests::feature:: --quiet
+fi
```

### Step 8: Write `tests/test.sh`

Copy from an existing task. This script is identical across all tasks except for one line. Only change:

```bash
PIER_MODEL_BASE_COMMIT="<same-base-commit-as-task.toml>"
```

> **CRLF handling on Windows:** If git patches are generated on Windows, the newer test.sh variant includes `tr -d '\r'` before `git apply` to strip carriage returns. Ensure your test.sh includes this if you encounter `git apply` failures.

The verifier script:
1. **Step 0:** Captures the agent's changes as `model.patch` artifact
2. **Step 1:** Resets files the test patch touches to base commit state
3. **Step 2:** Applies `test.patch` via `git apply --3way`
4. **Step 3:** Runs `bash /app/test.sh base` — baseline must pass (exit 0)
5. **Step 4:** Runs `bash /app/test.sh new` — new tests must pass (exit 0)
6. Writes `1` to `/logs/verifier/reward.txt` if both pass, `0` otherwise

### Step 9: Write `solution/solution.patch` + `solve.sh`

`solve.sh`:
```bash
#!/bin/bash
cd /app || exit 1
git apply --whitespace=nowarn /solution/solution.patch
```

`solution.patch`: Git diff containing the correct implementation. This is the answer key — verify it makes all tests pass.

### Step 10: Register in `dataset.toml`

The `dataset.toml` is a manifest listing all tasks with their integrity digests. Pier does **not** read this file at runtime — it discovers tasks by iterating the directory. The manifest is used by the **`harbor` publishing tool** for packaging and distribution.

```toml
[[tasks]]
name = "datacurve/my-tool-new-feature"
digest = "sha256:<computed-digest>"
```

Use the `harbor` CLI to register the task automatically:
```bash
harbor add datacurve/my-tool-new-feature
harbor publish
```

To compute the digest manually, Pier's internal algorithm iterates all task files sorted by name and hashes `relpath + \0 + content + \0` for each file. However, using `harbor add` is the recommended approach.

## Verifier Execution Flow

```
Container startup
  └─ tests/test.sh
       ├─ Step 0: git reset --soft <base> → git diff → model.patch
       ├─ Step 1: Reset test.patch files to HEAD state
       ├─ Step 2: tr -d '\r' < test.patch | git apply --whitespace=nowarn --3way
       ├─         (CRLF normalization before apply)
       ├─ Check: /app/test.sh exists
       ├─ Step 3: bash /app/test.sh base → exit code
       ├─ Step 4: bash /app/test.sh new → exit code
       └─ Write reward.txt (1 if both 0, else 0)
```

## Key Requirements

| Component | Required | Notes |
|-----------|----------|-------|
| `task.toml` | Yes | Must have `base_commit_hash` matching repo checkout |
| `instruction.md` | Yes | Agent reads this — be precise |
| `environment/Dockerfile` | Yes | Must clone repo at exact base commit |
| `tests/test.sh` | Yes | Copy template, change `PIER_MODEL_BASE_COMMIT` |
| `tests/test.patch` | Yes | Must add `/app/test.sh` with `base` and `new` modes |
| `solution/solution.patch` | Yes | Correct implementation diff |
| `solution/solve.sh` | Yes | Usually just `git apply` |
| `dataset.toml` entry | Yes | Required for dataset integrity |

## Common Mistakes

- **Baseline tests fail:** The `base` mode must pass on the unmodified repo. Always test against the base commit.
- **test.patch conflicts:** Use `git apply --3way` compatibility. Start diffs from the exact base commit.
- **Missing `/app/test.sh`:** Step 2 of verifier checks this explicitly. Always include it in `test.patch`.
- **Wrong base commit hash:** `PIER_MODEL_BASE_COMMIT` in `test.sh` must match `base_commit_hash` in `task.toml` and `Dockerfile`.
- **Instruction ambiguity:** Agents don't ask for clarification. Test your instruction with a human first.
- **Solution patch doesn't make tests pass:** Apply `solution.patch` to the base repo and run `bash /app/test.sh new` — must exit 0.

## Relationship: pier-src ↔ deep-swe

- **pier-src** is the evaluation framework (test runner, CLI, Docker orchestration, metrics)
- **deep-swe** is the benchmark dataset (task definitions, verifiers, solutions)
- Pier loads deep-swe tasks via `datasets[].path` pointing to the local deep-swe checkout
- No source-level dependency — deep-swe is purely data consumed by Pier
- Pier's unit tests (pytest in `tests/`) are separate from deep-swe task verifiers

## Quick Reference

```bash
# Verify task directory is valid
# Pier checks: task.toml, environment/, instruction.md, tests/test.sh

# Test the verifier locally (requires Docker)
docker build -t test-task tasks/<task-id>/environment/
docker run --rm test-task bash /tests/test.sh

# Run a single task through Pier
pier run -c job_config.yaml   # with task_names filter
```
