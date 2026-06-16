#!/usr/bin/env python3
"""Run skill quality evaluation using opencode.

For each test query, embeds the skill's SKILL.md content into a prompt,
runs `opencode run --format json`, and checks whether the output demonstrates
use of the skill's guidance. Each query runs multiple trials (--runs-per-query)
for statistical reliability, and results include mean trigger rate and
standard deviation.

Usage:
    python run_eval.py --eval-set <eval.json> --skill-path <path>
"""

import argparse
import json
import math
import os
import subprocess
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

# Ensure the skill-creator root is on sys.path for package imports
_script_dir = Path(__file__).resolve().parent.parent
if str(_script_dir) not in sys.path:
    sys.path.insert(0, str(_script_dir))

from scripts.utils import find_opencode, parse_skill_md


def _extract_keywords(skill_name: str, skill_content: str, max_words: int = 20) -> list[str]:
    """Extract meaningful keywords from the skill for content-based trigger detection.

    Takes words from the skill name and the first 500 chars of description.
    Filters to meaningful words (3+ chars, not common stopwords).
    """
    import re
    stopwords = {
        "the", "and", "for", "are", "not", "but", "you", "all", "can", "use",
        "this", "that", "with", "from", "your", "have", "has", "will", "what",
        "when", "where", "how", "why", "which", "their", "them", "they",
        "và", "của", "có", "được", "cho", "các", "hoặc", "trong", "một",
        "những", "khi", "với", "không", "người", "để", "từ", "làm", "này",
    }
    # Extract from name (split on hyphens and underscores)
    name_words = set(re.split(r'[-_\s]+', skill_name.lower()))
    # Extract from description frontmatter (first ~500 chars)
    desc_text = skill_content[:500].lower()
    desc_words = set(re.findall(r'\b[a-záàảãạăắằẳẵặâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ]{3,}\b', desc_text))

    keywords = (name_words | desc_words) - stopwords
    # Sort by length descending, then alphabetically for determinism
    sorted_kw = sorted(keywords, key=lambda w: (-len(w), w))
    return sorted_kw[:max_words]


def _response_uses_skill_knowledge(
    response_text: str,
    keywords: list[str],
    min_keyword_matches: int = 1,
) -> bool:
    """Check if the response demonstrates knowledge from the skill by
    checking for keyword overlap with the skill's domain.

    Uses regex word boundaries to avoid substring false matches.
    A response "triggers" (uses skill knowledge) if it contains at least
    `min_keyword_matches` distinct keywords from the skill.
    """
    import re
    response_lower = response_text.lower()
    matches = 0
    for kw in keywords:
        if re.search(r'\b' + re.escape(kw) + r'\b', response_lower):
            matches += 1
            if matches >= min_keyword_matches:
                return True
    return False


def run_single_trial(
    query: str,
    skill_content: str,
    skill_name: str,
    keywords: list[str],
    timeout: int,
    model: str | None = None,
    include_skill: bool = True,
) -> tuple[bool, str]:
    """Run a single trial and return (triggered, response_text).

    When include_skill=True: embeds skill content in prompt. Triggered
    if response uses skill keywords (tests true positive).

    When include_skill=False: bare query only. Triggered if response
    still mentions skill keywords (tests false positive -- the description
    is so broad that the skill domain leaks into unrelated answers).
    """
    if include_skill:
        prompt = (
            "You have access to the following skill. Use it to guide your response.\n\n"
            f"{skill_content}\n\n"
            "---\n\n"
            f"User request: {query}"
        )
    else:
        prompt = query

    opencode_bin = find_opencode()
    cmd = [opencode_bin, "run", "--format", "json"]
    if model:
        cmd.extend(["--model", model])
    cmd.append(prompt)

    # Remove OPENCODE env var to allow nesting inside an active session
    env = {k: v for k, v in os.environ.items() if k != "OPENCODE"}

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        encoding="utf-8",
        env=env,
    )

    response_text = ""
    start_time = time.time()

    try:
        while time.time() - start_time < timeout:
            if process.poll() is not None:
                remaining = process.stdout.read()
                if remaining:
                    for line in remaining.split("\n"):
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            event = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        if event.get("type") == "text":
                            text = event.get("part", {}).get("text", "")
                            response_text += text
                break

            line = process.stdout.readline()
            if not line:
                continue
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if event.get("type") == "text":
                text = event.get("part", {}).get("text", "")
                response_text += text
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()

    triggered = _response_uses_skill_knowledge(response_text, keywords)
    return triggered, response_text.strip()


def compute_mean(values: list[float]) -> float:
    """Compute mean of a list of floats."""
    if not values:
        return 0.0
    return sum(values) / len(values)


def compute_stdev(values: list[float], mean: float | None = None) -> float:
    """Compute population standard deviation of a list of floats."""
    if len(values) < 2:
        return 0.0
    if mean is None:
        mean = compute_mean(values)
    variance = sum((x - mean) ** 2 for x in values) / len(values)
    return math.sqrt(variance)


def run_eval(
    eval_set: list[dict],
    skill_name: str,
    skill_content: str,
    num_workers: int,
    timeout: int,
    runs_per_query: int = 3,
    trigger_threshold: float = 0.5,
    model: str | None = None,
) -> dict:
    """Run the full eval set and return results with statistics.

    Each eval item should have:
      - query: the test prompt
      - should_trigger: whether this query should trigger the skill
      - expected_output (optional): description of what good output looks like
    """
    keywords = _extract_keywords(skill_name, skill_content)
    results = []

    with ProcessPoolExecutor(max_workers=num_workers) as executor:
        future_to_info = {}
        for item in eval_set:
            query = item["query"]
            # For should_trigger=True: include skill context, check keyword use
            # For should_trigger=False: no skill context, check if keywords leak
            include_skill = item.get("should_trigger", True)
            for run_idx in range(runs_per_query):
                future = executor.submit(
                    run_single_trial,
                    query,
                    skill_content,
                    skill_name,
                    keywords,
                    timeout,
                    model,
                    include_skill,
                )
                future_to_info[future] = (item, run_idx)

        query_results: dict[str, list[bool]] = {}
        query_responses: dict[str, list[str]] = {}
        query_items: dict[str, dict] = {}
        for future in as_completed(future_to_info):
            item, _ = future_to_info[future]
            query = item["query"]
            query_items[query] = item
            if query not in query_results:
                query_results[query] = []
                query_responses[query] = []
            try:
                triggered, resp = future.result()
                query_results[query].append(triggered)
                query_responses[query].append(resp[:200])
            except Exception as e:
                print(f"Warning: query failed: {e}", file=sys.stderr)
                query_results[query].append(False)
                query_responses[query].append("")

    # Build per-query results with trigger_rate, mean, std
    for query, trial_results in query_results.items():
        item = query_items[query]
        trigger_rate = sum(trial_results) / len(trial_results)
        should_trigger = item.get("should_trigger", True)

        if should_trigger:
            did_pass = trigger_rate >= trigger_threshold
        else:
            did_pass = trigger_rate < trigger_threshold

        results.append({
            "query": query,
            "expected_output": item.get("expected_output", ""),
            "should_trigger": should_trigger,
            "trigger_rate": round(trigger_rate, 4),
            "triggers": sum(trial_results),
            "runs": len(trial_results),
            "pass": did_pass,
        })

    passed = sum(1 for r in results if r["pass"])
    total = len(results)

    # Compute mean and std across result groups
    positive_rates = [r["trigger_rate"] for r in results if r["should_trigger"]]
    negative_rates = [r["trigger_rate"] for r in results if not r["should_trigger"]]
    all_rates = [r["trigger_rate"] for r in results]

    summary = {
        "total": total,
        "passed": passed,
        "failed": total - passed,
        "mean_trigger_rate": round(compute_mean(all_rates), 4),
        "std_trigger_rate": round(compute_stdev(all_rates), 4),
        "mean_trigger_rate_positive": round(compute_mean(positive_rates), 4) if positive_rates else None,
        "std_trigger_rate_positive": round(compute_stdev(positive_rates), 4) if positive_rates else None,
        "mean_trigger_rate_negative": round(compute_mean(negative_rates), 4) if negative_rates else None,
        "std_trigger_rate_negative": round(compute_stdev(negative_rates), 4) if negative_rates else None,
    }

    return {
        "skill_name": skill_name,
        "results": results,
        "summary": summary,
    }


def main():
    parser = argparse.ArgumentParser(description="Run skill quality evaluation")
    parser.add_argument("--eval-set", required=True, help="Path to eval set JSON file")
    parser.add_argument("--skill-path", required=True, help="Path to skill directory")
    parser.add_argument("--num-workers", type=int, default=5, help="Number of parallel workers")
    parser.add_argument("--timeout", type=int, default=60, help="Timeout per query in seconds")
    parser.add_argument("--runs-per-query", type=int, default=3, help="Number of trials per query")
    parser.add_argument("--trigger-threshold", type=float, default=0.5, help="Min trigger rate to pass")
    parser.add_argument("--model", default="opencode/deepseek-v4-flash-free", help="Model to use for opencode run")
    parser.add_argument("--verbose", action="store_true", help="Print progress to stderr")
    args = parser.parse_args()

    eval_set = json.loads(Path(args.eval_set).read_text(encoding="utf-8-sig"))
    skill_path = Path(args.skill_path)

    if not (skill_path / "SKILL.md").exists():
        print(f"Error: No SKILL.md found at {skill_path}", file=sys.stderr)
        sys.exit(1)

    name, _, content = parse_skill_md(skill_path)

    if args.verbose:
        print(f"Evaluating skill: {name}", file=sys.stderr)
        print(f"Test cases: {len(eval_set)}", file=sys.stderr)
        print(f"Runs per query: {args.runs_per_query}", file=sys.stderr)

    output = run_eval(
        eval_set=eval_set,
        skill_name=name,
        skill_content=content,
        num_workers=args.num_workers,
        timeout=args.timeout,
        runs_per_query=args.runs_per_query,
        trigger_threshold=args.trigger_threshold,
        model=args.model,
    )

    if args.verbose:
        summary = output["summary"]
        print(f"\nResults: {summary['passed']}/{summary['total']} passed", file=sys.stderr)
        print(f"Mean trigger rate: {summary['mean_trigger_rate']:.4f} "
              f"(std={summary['std_trigger_rate']:.4f})", file=sys.stderr)
        if summary["mean_trigger_rate_positive"] is not None:
            print(f"  Positive: mean={summary['mean_trigger_rate_positive']:.4f} "
                  f"std={summary['std_trigger_rate_positive']:.4f}", file=sys.stderr)
        if summary["mean_trigger_rate_negative"] is not None:
            print(f"  Negative: mean={summary['mean_trigger_rate_negative']:.4f} "
                  f"std={summary['std_trigger_rate_negative']:.4f}", file=sys.stderr)
        for r in output["results"]:
            status = "PASS" if r["pass"] else "FAIL"
            print(f"  [{status}] rate={r['triggers']}/{r['runs']} "
                  f"expected={r['should_trigger']}: {r['query'][:70]}", file=sys.stderr)

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
