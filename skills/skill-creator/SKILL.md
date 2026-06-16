---
name: skill-creator
description: >
  Create new skills, modify and improve existing skills, and benchmark skill
  performance with statistical rigor. Use when users want to create a skill
  from scratch, edit or optimize an existing skill, run evals to test a skill,
  benchmark skill performance with variance analysis (mean, stddev, trigger
  rates), or optimize a skill's description for better accuracy.
---

# Skill Creator (OpenCode Edition)

A skill for creating new skills and iteratively improving them through
statistically-rigorous evaluation.

At a high level, the process of creating a skill goes like this:

- Decide what you want the skill to do and roughly how it should do it
- Write a draft SKILL.md
- Create test prompts and run `opencode run --format json` to evaluate responses
- Review results (qualitative + quantitative with mean/std trigger rates)
- Rewrite the skill based on feedback
- Repeat until satisfied

Your job when using this skill is to figure out where the user is in this
process and help them progress through these stages.

---

## Create a New Skill

### Capture Intent

1. What should this skill help the agent do?
2. What category of tasks does it cover?
3. What are clear examples of when to use it vs when not to?

Help the user narrow down these questions. Ask clarifying questions.

### Generate Draft

Write a draft SKILL.md in `skills/<name>/SKILL.md` following this template:

```markdown
---
name: skill-name
description: >
  One paragraph. Focus on USER INTENT, not implementation details.
  This is what agents see when deciding to load the skill.
---

# Skill Name

Brief overview. What this skill helps the agent accomplish.

## When to Use

- Specific scenarios where this skill applies
- Clear examples

## How to Use

Step-by-step guidance.

## Examples

Illustrative examples showing input/output patterns.

## Configuration

Any config, environment variables, or prerequisites.
```

### Create Eval Set

Create `skills/<name>/eval.json` with test queries:

```json
[
  {
    "query": "A query that SHOULD use this skill",
    "should_trigger": true,
    "expected_output": "What good looks like"
  },
  {
    "query": "An unrelated query",
    "should_trigger": false
  }
]
```

Each query runs multiple trials (default: 3) to compute statistically
meaningful trigger rates with mean and standard deviation.

### Run Evaluation

```bash
python skills/skill-creator/scripts/run_eval.py \
  --eval-set skills/<name>/eval.json \
  --skill-path skills/<name> \
  --runs-per-query 3 \
  --verbose
```

Output JSON includes per-query trigger rates and summary stats:
```json
{
  "summary": {
    "mean_trigger_rate": 0.78,
    "std_trigger_rate": 0.15,
    "mean_trigger_rate_positive": 0.92,
    "std_trigger_rate_positive": 0.08
  }
}
```

## Optimize Description

Run the iterative improvement loop:

```bash
python skills/skill-creator/scripts/run_loop.py \
  --eval-set skills/<name>/eval.json \
  --skill-path skills/<name> \
  --model opencode/deepseek-v4-flash-free \
  --runs-per-query 3 \
  --max-iterations 5 \
  --verbose
```

This will:
1. Run eval on current description
2. If failures exist, call `opencode run` to generate improved description
3. Re-evaluate with new description
4. Repeat until all pass or max iterations reached
5. Report the best-performing description with mean/std stats

### Train/Test Split

Use `--holdout 0.4` (default) to hold out 40% of eval queries as a test set.
The optimizer only sees train results; best iteration is chosen by test score
to prevent overfitting.

## Package Skill

```bash
python skills/skill-creator/scripts/package_skill.py skills/<name>
```

Creates `<name>.skill` (zip archive) for distribution.

## Benchmarking

For detailed benchmarking with full statistical analysis across multiple
configurations (with_skill vs without_skill):

```bash
python skills/skill-creator/scripts/aggregate_benchmark.py <benchmark_dir>
```

Outputs `benchmark.json` with mean, stddev, min, max for pass rates, timing,
and token usage, plus delta between configurations.

## Architecture

The evaluation pipeline works as follows:

1. Each query runs `opencode run --format json` with the skill's SKILL.md
   content embedded as context
2. The response is evaluated for substantive skill application
3. Multiple trials per query (--runs-per-query) provide statistical reliability
4. trigger_rate = trials where skill guidance was applied / total trials
5. A query passes if trigger_rate >= threshold (default 0.5)
6. Results include mean and standard deviation across all queries

For `should_trigger: false` queries, the skill content is excluded from the
prompt to test whether the description is specific enough to avoid false
positives.

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `run_eval.py` | Run single evaluation, output JSON with stats |
| `run_loop.py` | Iterative eval + improve loop |
| `improve_description.py` | Generate improved description via opencode |
| `generate_report.py` | HTML report from run_loop output |
| `quick_validate.py` | Validate SKILL.md structure |
| `package_skill.py` | Package skill into .skill file |
| `aggregate_benchmark.py` | Aggregate benchmark stats (mean, stddev, delta) |
