#!/usr/bin/env python3
"""ACTIVE shared COROS FIT download quota ledger.

The three sport sites sync from one COROS account, which allows 50 FIT
downloads a day. Each workflow used to assume the whole allowance (cap 45),
so two sites backfilling at once would starve the third until tomorrow.

Before syncing, a repo RESERVES its share of today's allowance in a shared
ledger — zhubao315/active-watch, file state/fit-quota.json — and after
syncing it RECONCILES the entry with the number actually downloaded, so a
quiet day hands its unused share back to the other two.

Failure model: any problem with the ledger degrades to a small static
budget (fail-open but never the full cap). The sync must never fail because
the quota service is down.

This file is byte-identical in running/cycling/hiking under scripts/.
"""
import argparse
import base64
import datetime
import json
import os
import sys
import urllib.error
import urllib.request

API = os.environ.get("GITHUB_API", "https://api.github.com")
LEDGER_REPO = os.environ.get("LEDGER_REPO", "zhubao315/active-watch")
LEDGER_FILE = os.environ.get("LEDGER_FILE", "state/fit-quota.json")
LEDGER_REF = os.environ.get("LEDGER_REF", "main")
DAILY_TOTAL = int(os.environ.get("QUOTA_DAILY_TOTAL", "50"))
FALLBACK_ALLOW = int(os.environ.get("QUOTA_FALLBACK_ALLOW", "10"))
HISTORY_DAYS = 3
API_HEADERS = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "active-quota-lease",
}


def log(msg: str) -> None:
    print(f"[quota] {msg}", file=sys.stderr)


def token():
    return os.environ.get("ACTIVE_STATE_TOKEN") or None


def utc_today(offset_days: int = 0) -> str:
    d = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=offset_days)
    return d.strftime("%Y-%m-%d")


def gh_json(url: str, payload=None, method: str = "GET"):
    headers = dict(API_HEADERS)
    tok = token()
    if tok:
        headers["Authorization"] = f"Bearer {tok}"
    req = urllib.request.Request(url, headers=headers)
    if payload is not None:
        req.data = json.dumps(payload).encode()
        req.method = method
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read()
    return json.loads(body) if body else {}


def read_ledger():
    """Return (ledger_dict, blob_sha_or_None). A missing file means fresh."""
    url = f"{API}/repos/{LEDGER_REPO}/contents/{LEDGER_FILE}?ref={LEDGER_REF}"
    try:
        doc = gh_json(url)
        data = json.loads(base64.b64decode(doc["content"]))
        return data, doc.get("sha")
    except urllib.error.HTTPError as e:
        if e.code in (404, 406):
            return {"days": {}}, None
        raise


def prune(days: dict) -> dict:
    floor = utc_today(-HISTORY_DAYS)
    return {d: v for d, v in days.items() if d >= floor}


def update_ledger(repo: str, mutator, attempts: int = 3) -> bool:
    """Read-modify-write with conflict retries; `mutator(day_dict)` edits today.

    Without a token the ledger is read-only: every repo then computes from
    the last committed state — still fairer than each assuming the full cap.
    """
    if not token():
        log("no ACTIVE_STATE_TOKEN: computed from last known state; this repo's share is not recorded")
    for attempt in range(attempts):
        ledger, sha = read_ledger()
        ledger["days"] = prune(ledger.get("days", {}))
        day = ledger["days"].setdefault(utc_today(), {})
        mutator(day)
        if not token():
            return False
        payload = {
            "message": f"quota: {utc_today()} ({repo})",
            "branch": LEDGER_REF,
            "content": base64.b64encode(json.dumps(ledger, ensure_ascii=False, indent=2).encode()).decode(),
        }
        if sha:
            payload["sha"] = sha
        try:
            gh_json(f"{API}/repos/{LEDGER_REPO}/contents/{LEDGER_FILE}", payload, method="PUT")
            return True
        except urllib.error.HTTPError as e:
            if e.code in (409, 422, 412):  # lost the race: re-read and retry
                log(f"ledger conflict (attempt {attempt + 1}); retrying")
                continue
            raise
        except Exception as exc:  # network etc.: fail open, never block a sync
            log(f"ledger write failed: {exc}")
            return False
    log("gave up after conflicts; running on the last computed number")
    return False


def cmd_reserve(args) -> None:
    allow = FALLBACK_ALLOW

    def mutate(day: dict) -> None:
        nonlocal allow
        used_by_others = sum(int(v) for r, v in day.items() if r != args.repo)
        computed = max(0, min(args.cap, DAILY_TOTAL - used_by_others))
        allow = min(args.want, computed)
        day[args.repo] = max(int(day.get(args.repo, 0)), allow)
        others = ", ".join(f"{r}={v}" for r, v in sorted(day.items()) if r != args.repo) or "none yet"
        log(f"today {utc_today()}: others hold {used_by_others}/{DAILY_TOTAL} ({others}); asking {args.want} -> {allow}")

    try:
        update_ledger(args.repo, mutate)
    except Exception as exc:  # noqa: BLE001 — the sync must not die on the ledger
        log(f"ledger unavailable ({exc}); falling back to a conservative {FALLBACK_ALLOW}")
    print(allow)


def cmd_reconcile(args) -> None:
    def mutate(day: dict) -> None:
        before = int(day.get(args.repo, 0))
        day[args.repo] = min(before, args.used) if before else args.used
        log(f"reconcile {args.repo}: reserved {before} -> used {args.used}")

    try:
        update_ledger(args.repo, mutate)
    except Exception as exc:  # noqa: BLE001
        log(f"reconcile skipped: {exc}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("mode", choices=["reserve", "reconcile"])
    ap.add_argument("--repo", required=True)
    ap.add_argument("--want", type=int, default=10, help="downloads this run hopes to use")
    ap.add_argument("--cap", type=int, default=45, help="per-repo hard cap")
    ap.add_argument("--used", type=int, help="actual downloads (reconcile)")
    args = ap.parse_args()
    (cmd_reserve if args.mode == "reserve" else cmd_reconcile)(args)


if __name__ == "__main__":
    main()
