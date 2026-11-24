#!/usr/bin/env python3
"""Aura orchestra baseline drift gate (#13).

Every member/stage repo declares the same Aura nightly commit, nightly
archive digest and aura-ci image digest in aura.toml, and pins the image
by digest in its workflows. This checker fails closed on drift and never
writes a tag, a release, or a workflow.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys
import tomllib

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_BASELINE = ROOT / "baseline" / "aura-baseline.json"
IMAGE_RE = re.compile(r"ghcr.io/cybrid-systems/aura-ci(?:[:@][A-Za-z0-9._:-]+)?")


def load_baseline(path: pathlib.Path) -> dict:
    with path.open("rb") as fh:
        data = json.load(fh)
    aura = data["aura"]
    ci = data["aura_ci"]
    if not re.fullmatch(r"[0-9a-f]{40}", aura["commit_sha"]):
        raise ValueError("baseline aura.commit_sha is not a 40-char sha")
    if not ci["digest"].startswith("sha256:"):
        raise ValueError("baseline aura_ci.digest is not a sha256 digest")
    for arch in ("linux-x86_64", "linux-arm64"):
        asset = aura["assets"][arch]
        if not re.fullmatch(r"[0-9a-f]{64}", asset["sha256"]):
            raise ValueError(f"baseline {arch} sha256 is malformed")
    return data


def load_toml(path: pathlib.Path) -> dict:
    if not path.is_file():
        return {}
    with path.open("rb") as fh:
        return tomllib.load(fh)


def check_repo(repo: pathlib.Path, baseline: dict) -> list[str]:
    findings: list[str] = []
    aura = baseline["aura"]
    ci = baseline["aura_ci"]
    pinned = f"{ci['image']}@{ci['digest']}"

    toml = load_toml(repo / "aura.toml")
    deps = toml.get("dependencies", {}) if isinstance(toml, dict) else {}
    if deps.get("aura") != "nightly":
        findings.append("aura.toml: dependencies.aura must be 'nightly'")
    if deps.get("aura_commit") != aura["commit_sha"]:
        findings.append(
            "aura.toml: dependencies.aura_commit drift "
            f"(want {aura['commit_sha']}, got {deps.get('aura_commit')})"
        )
    if deps.get("aura_ci_digest") != ci["digest"]:
        findings.append(
            "aura.toml: dependencies.aura_ci_digest drift "
            f"(want {ci['digest']}, got {deps.get('aura_ci_digest')})"
        )
    for arch, asset in aura["assets"].items():
        key = "aura_sha256_" + arch.replace("-", "_")
        if deps.get(key) != asset["sha256"]:
            findings.append(
                f"aura.toml: dependencies.{key} drift "
                f"(want {asset['sha256']}, got {deps.get(key)})"
            )

    workflows = sorted((repo / ".github" / "workflows").glob("*.yml"))
    workflows += sorted((repo / ".github" / "workflows").glob("*.yaml"))
    if not workflows:
        findings.append(".github/workflows: no workflow found")
    pinned_seen = False
    for wf in workflows:
        text = wf.read_text(encoding="utf-8")
        if pinned in text:
            pinned_seen = True
        for found in IMAGE_RE.findall(text):
            if found != pinned:
                findings.append(
                    f"{wf.name}: floating/foreign aura-ci reference {found}"
                )
        if "ghcr.io/cybrid-systems/dev:" in text:
            findings.append(f"{wf.name}: legacy dev image reference")
        if re.search(r"aura-ci:latest", text):
            findings.append(f"{wf.name}: floating aura-ci:latest")
    if workflows and not pinned_seen:
        findings.append(f"workflows: no pinned image {pinned}")

    install = repo / "scripts" / "install-aura.sh"
    if not install.is_file():
        findings.append("scripts/install-aura.sh: missing pinned installer")
    else:
        text = install.read_text(encoding="utf-8")
        if "AURA_VERSION" not in text or "sha256sum" not in text:
            findings.append(
                "scripts/install-aura.sh: does not verify the archive digest"
            )

    return findings


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--repo", type=pathlib.Path, default=ROOT, help="repo to check")
    ap.add_argument("--self", action="store_true", help="check this repo (default)")
    ap.add_argument("--baseline", type=pathlib.Path, default=DEFAULT_BASELINE)
    ap.add_argument("--json", action="store_true", help="machine-readable findings")
    args = ap.parse_args()
    repo = args.repo if args.repo != ROOT else ROOT
    try:
        baseline = load_baseline(args.baseline)
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as exc:
        print(f"baseline error: {exc}", file=sys.stderr)
        return 2
    findings = check_repo(repo, baseline)
    if args.json:
        print(
            json.dumps(
                {
                    "repo": str(repo),
                    "aura_commit_sha": baseline["aura"]["commit_sha"],
                    "aura_ci_digest": baseline["aura_ci"]["digest"],
                    "findings": findings,
                    "ok": not findings,
                },
                indent=2,
                sort_keys=True,
            )
        )
    else:
        if findings:
            print(f"baseline drift: {repo}", file=sys.stderr)
            for finding in findings:
                print(f"  - {finding}", file=sys.stderr)
        else:
            print(f"baseline ok: {repo} @ {baseline['aura']['commit_sha'][:9]}")
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
