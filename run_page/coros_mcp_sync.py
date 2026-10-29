#!/usr/bin/env python3
"""Sync running activities from the official COROS MCP server.

Why this exists
---------------
`coros_sync.py` talks to the old private web API with an MD5-hashed password.
COROS now exposes an official MCP server (https://mcp.coros.com, regional
clusters such as https://mcpcn.coros.com) with OAuth 2.0 and a FIT download
tool.  This script speaks that MCP endpoint directly so the sync keeps working
without a Strava token and without relying on the legacy endpoints.

Flow
----
1. OAuth 2.0 authorization-code + PKCE login against the COROS MCP gateway.
   COROS still accepts the "legacy" username/password form during the
   authorization step, so the whole handshake can run unattended in CI.
   Tokens are cached (and refreshed) so local runs do not log in every time.
2. `querySportRecords` lists activities in the requested date range.
3. `queryActivityFitFileDownloadUrls` resolves the original FIT file for each
   new activity (COROS caps FIT downloads at 50/day on the MCP side).
4. FIT files land in FIT_OUT/ and `make_activities_file` rebuilds data.db /
   src/static/activities.json, exactly like the other sync scripts.

Usage
-----
    python run_page/coros_mcp_sync.py --account "$COROS_ACCOUNT" --password "$COROS_PASSWORD"
    python run_page/coros_mcp_sync.py ... --start-date 2026-06-28
    python run_page/coros_mcp_sync.py ... --all-sports --max-downloads 40

Environment:
    COROS_MCP_ISSUER   override gateway (default https://mcpcn.coros.com)
    COROS_MCP_TOKEN    path of the token cache (default ~/.coros-mcp-sync/token.json)
"""

import argparse
import base64
import datetime
import hashlib
import json
import os
import re
import secrets
import sqlite3
import sys
import time
from urllib.parse import parse_qs, urlencode, urlparse

import urllib.error
import urllib.request

from config import FIT_FOLDER, JSON_FILE, SQL_FILE
from utils import make_activities_file

DEFAULT_ISSUER = "https://mcpcn.coros.com"
REDIRECT_URI = "http://127.0.0.1:43123/callback"
SCOPES = "openid offline_access mcp.tools"
CLIENT_NAME = "running-page-coros-mcp-sync"
TOKEN_PATH = os.path.expanduser(
    os.getenv("COROS_MCP_TOKEN", "~/.coros-mcp-sync/token.json")
)
RUNNING_SPORT_TYPES = [100, 101, 102, 103]  # outdoor / indoor / trail running

RECORD_RE = re.compile(r"LabelId:\s*(\d+)\s*\|\s*SportType:\s*(\d+)", re.MULTILINE)
RECORD_DATE_RE = re.compile(r"—\s*(\d{4}-\d{2}-\d{2})")
CURSOR_FILE = os.path.join(FIT_FOLDER, ".coros_sync_cursor")


def log(msg):
    print(f"[coros-mcp] {msg}", flush=True)


# ---------------------------------------------------------------------------
# OAuth
# ---------------------------------------------------------------------------
def _pkce_pair():
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(48)).decode().rstrip("=")
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).decode().rstrip("=")
    return verifier, challenge


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Turn redirects into HTTPError so we can read the Location header."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _request(url, method="GET", json_body=None, form=None, follow=False, timeout=60):
    """Minimal HTTP helper built on urllib (no redirects unless `follow`).

    Returns (status, headers, body bytes). Redirects and HTTP errors are
    returned instead of raised so the OAuth handshake can inspect Location.
    """
    data = None
    headers = {"User-Agent": "running-page-coros-mcp-sync/1.0"}
    if json_body is not None:
        data = json.dumps(json_body).encode()
        headers["Content-Type"] = "application/json"
        headers["Accept"] = "application/json"
    elif form is not None:
        data = urlencode(form).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    opener = urllib.request.build_opener()
    if not follow:
        opener = urllib.request.build_opener(_NoRedirect)
    try:
        with opener.open(req, timeout=timeout) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers), exc.read()
    except urllib.error.URLError as exc:
        raise RuntimeError(f"{method} {url} failed: {exc.reason}")


def _post_json(url, payload, timeout=60):
    status, _, body = _request(url, "POST", json_body=payload, timeout=timeout)
    if status not in (200, 201):
        raise RuntimeError(f"POST {url} failed ({status}): {body[:300]!r}")
    return json.loads(body)


def _token_from_response(payload):
    expires_in = int(payload.get("expires_in") or 3600)
    return {
        "access_token": payload["access_token"],
        "refresh_token": payload.get("refresh_token"),
        "expires_at": int(time.time()) + expires_in - 60,
        "issuer": payload.get("issuer", ""),
    }


def write_token(token):
    os.makedirs(os.path.dirname(TOKEN_PATH), exist_ok=True)
    with open(TOKEN_PATH, "w") as f:
        json.dump(token, f)
    os.chmod(TOKEN_PATH, 0o600)


def read_token():
    try:
        with open(TOKEN_PATH) as f:
            return json.load(f)
    except Exception:
        return None


def login(issuer, account, password):
    """Authorization-code + PKCE, with COROS' username/password login step."""
    client_info = _post_json(
        f"{issuer}/connect/register",
        {
            "client_name": CLIENT_NAME,
            "redirect_uris": [REDIRECT_URI],
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "scope": SCOPES,
            "token_endpoint_auth_method": "none",
        },
    )
    client_id = client_info["client_id"]
    verifier, challenge = _pkce_pair()
    state = secrets.token_urlsafe(24)

    authorize_url = f"{issuer}/oauth2/authorize?" + urlencode(
        {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": REDIRECT_URI,
            "scope": SCOPES,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "resource": f"{issuer}/mcp",
            "state": state,
        }
    )
    status, headers, _ = _request(authorize_url)
    coros_url = headers.get("Location") or headers.get("location")
    if status not in (302, 303) or not coros_url:
        raise RuntimeError("MCP gateway did not redirect to the COROS login page")

    query = parse_qs(urlparse(coros_url).query)
    # COROS accepts the plain password here; this is the same form the browser
    # posts and what the official coros-mcp helper sends.
    login_form = {
        "client_id": (query.get("client_id") or [""])[0],
        "redirect_uri": (query.get("redirect_uri") or [""])[0],
        "state": (query.get("state") or [""])[0],
        "scope": (query.get("scope") or [""])[0],
        "response_type": (query.get("response_type") or ["code"])[0],
        "activityType": "",
        "language": "zh",
        "country": "CN",
        "userName": account,
        "password": password,
        "checkStatus": "1",
        "getAllHistoryIn24Hours": "0",
    }
    status, headers, _ = _request(coros_url, "POST", form=login_form)
    callback_url = headers.get("Location") or headers.get("location")
    if status not in (302, 303) or not callback_url:
        raise RuntimeError(
            "COROS login failed (no redirect back to the MCP gateway). "
            "Check the account/password and that the account is registered "
            "on the CN cluster."
        )

    status, headers, _ = _request(callback_url)
    resume_url = headers.get("Location") or headers.get("location")
    if status not in (302, 303) or not resume_url:
        raise RuntimeError("MCP gateway did not resume the authorization flow")

    status, headers, _ = _request(resume_url)
    final_url = headers.get("Location") or headers.get("location")
    if status not in (302, 303) or not final_url:
        raise RuntimeError("MCP gateway did not return to the client callback")

    params = parse_qs(urlparse(final_url).query)
    code = (params.get("code") or [None])[0]
    returned_state = (params.get("state") or [None])[0]
    if not code:
        raise RuntimeError(
            f"authorization code missing from callback: {final_url.split('?')[0]}"
        )
    if returned_state != state:
        raise RuntimeError("OAuth state mismatch")

    status, _, body = _request(
        f"{issuer}/oauth2/token",
        "POST",
        form={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": REDIRECT_URI,
            "client_id": client_id,
            "code_verifier": verifier,
        },
    )
    if status != 200:
        raise RuntimeError(f"token exchange failed ({status}): {body[:300]!r}")
    token = _token_from_response(json.loads(body))
    token["issuer"] = issuer
    write_token(token)
    return token


def refresh(token):
    issuer = token.get("issuer") or DEFAULT_ISSUER
    if not token.get("refresh_token"):
        return None
    status, _, body = _request(
        f"{issuer}/oauth2/token",
        "POST",
        form={
            "grant_type": "refresh_token",
            "refresh_token": token["refresh_token"],
        },
    )
    if status != 200:
        log(f"token refresh failed ({status}); falling back to login")
        return None
    fresh = _token_from_response(json.loads(body))
    fresh["issuer"] = issuer
    write_token(fresh)
    return fresh


def get_token(issuer, account, password):
    token = read_token()
    if token and token.get("access_token"):
        if token.get("expires_at", 0) > time.time():
            return token
        fresh = refresh(token)
        if fresh:
            return fresh
    return login(issuer, account, password)


# ---------------------------------------------------------------------------
# MCP JSON-RPC
# ---------------------------------------------------------------------------
def mcp_call(token, tool, arguments):
    issuer = token.get("issuer") or DEFAULT_ISSUER
    headers = {
        "Authorization": f"Bearer {token['access_token']}",
        "Accept": "application/json, text/event-stream",
        "Content-Type": "application/json",
    }
    body = {
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/call",
        "params": {"name": tool, "arguments": arguments},
    }
    req = urllib.request.Request(
        f"{issuer}/mcp", data=json.dumps(body).encode(), headers=headers, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            payload = json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"MCP {tool} failed ({exc.code}): {exc.read()[:300]!r}")
    if "error" in payload:
        raise RuntimeError(f"MCP {tool} error: {payload['error']}")
    result = payload.get("result")
    if not isinstance(result, dict):
        raise RuntimeError(f"MCP {tool} returned no result")
    text = "\n".join(
        item.get("text", "")
        for item in result.get("content", [])
        if item.get("type") == "text"
    )
    if result.get("isError"):
        raise RuntimeError(f"MCP {tool} reported an error: {text[:300]}")
    # Some tools (e.g. querySportRecords) double-encode their output: the text
    # field is itself a JSON string. Decode it so line-based parsing works.
    if text.startswith('"') and text.endswith('"'):
        try:
            decoded = json.loads(text)
            if isinstance(decoded, str):
                text = decoded
        except ValueError:
            pass
    return text


def list_activity_labels(token, start_date, end_date, sport_types):
    text = mcp_call(
        token,
        "querySportRecords",
        {
            "startDate": start_date,
            "endDate": end_date,
            "sportTypeCodes": sport_types,
            "limit": 500,
        },
    )
    labels = []
    for block in re.split(r"\n(?=\s*\d+\.\s)", text):
        match = RECORD_RE.search(block)
        if not match:
            continue
        date_match = RECORD_DATE_RE.search(block)
        labels.append(
            (
                match.group(1),
                int(match.group(2)),
                date_match.group(1) if date_match else "",
            )
        )
    # newest first from the tool; keep that order
    log(f"{len(labels)} activities listed between {start_date} and {end_date}")
    return labels


def fit_url_for(token, label_id, sport_type):
    text = mcp_call(
        token,
        "queryActivityFitFileDownloadUrls",
        {"labelId": label_id, "sportType": sport_type},
    )
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("http"):
            return line
    return None


def download_fit(url, folder):
    name = os.path.basename(urlparse(url).path) or "activity.fit"
    if not name.endswith(".fit"):
        name = f"{name}.fit"
    target = os.path.join(folder, name)
    if os.path.exists(target) and os.path.getsize(target) > 0:
        return target, False
    status, _, body = _request(url, follow=True, timeout=180)
    if status != 200:
        raise RuntimeError(f"FIT download failed ({status}) for {url}")
    with open(target, "wb") as f:
        f.write(body)
    return target, True


# ---------------------------------------------------------------------------
# Sync
# ---------------------------------------------------------------------------
def last_synced_date():
    """Incremental start date: newest activity minus 2 days.

    If a previous run hit the daily FIT cap, a cursor points at the oldest
    activity that is still missing, and the range starts there instead.
    """
    newest = None
    try:
        with open(JSON_FILE) as f:
            activities = json.load(f)
        if activities:
            latest = max(a["start_date_local"] for a in activities)
            newest = datetime.datetime.strptime(
                latest, "%Y-%m-%d %H:%M:%S"
            ).date() - datetime.timedelta(days=2)
    except Exception:
        pass
    if newest is None:
        newest = datetime.date.today() - datetime.timedelta(days=730)
    try:
        with open(CURSOR_FILE) as f:
            cursor = datetime.datetime.strptime(f.read().strip(), "%Y%m%d").date()
        return min(newest, cursor)
    except Exception:
        return newest


def write_cursor(date_str):
    with open(CURSOR_FILE, "w") as f:
        f.write(date_str)


def clear_cursor():
    try:
        os.remove(CURSOR_FILE)
    except FileNotFoundError:
        pass


def downloaded_label_ids(folder):
    ids = set()
    for name in os.listdir(folder):
        stem = os.path.splitext(name)[0]
        if stem.isdigit():
            ids.add(stem)
    return ids


PROCESSED_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), ".coros_processed.json"
)


def _db_activity_count():
    try:
        con = sqlite3.connect(SQL_FILE)
        n = con.execute("SELECT COUNT(*) FROM activities").fetchone()[0]
        con.close()
        return n
    except Exception:
        return 0


def processed_label_ids():
    """Label ids already ingested into data.db.

    ``--purge-fit`` (and the ephemeral runner) means the FIT folder is empty at
    the start of every run, so the sync would re-download the whole date window
    and burn the account-wide 50 FIT/day COROS quota shared by every site.
    This committed manifest records what has actually been imported.  It is
    ignored when data.db is empty so a wiped database still re-downloads.
    """
    if _db_activity_count() == 0:
        return set()
    try:
        with open(PROCESSED_FILE) as f:
            return set(json.load(f))
    except Exception:
        return set()


def mark_processed(label_ids):
    ids = processed_label_ids() | {str(i) for i in label_ids}
    if not ids:
        return
    with open(PROCESSED_FILE, "w") as f:
        json.dump(sorted(ids), f)


def auto_name(start_date_local):
    """Strava-like default title for FIT files, which carry no activity name."""
    try:
        hour = int(start_date_local[11:13])
    except Exception:
        return "Run"
    if 5 <= hour < 11:
        return "Morning Run"
    if 11 <= hour < 14:
        return "Lunch Run"
    if 14 <= hour < 18:
        return "Afternoon Run"
    if 18 <= hour < 22:
        return "Evening Run"
    return "Night Run"


def tidy_generated_json():
    """Normalise FIT-derived values the web UI does not expect.

    FIT timestamps carry microseconds ("1:10:00.420000") and no activity name.
    The frontend parses durations with Number(), so trim to whole seconds and
    give untitled runs a time-of-day name.
    """
    with open(JSON_FILE) as f:
        activities = json.load(f)
    changed = False
    for activity in activities:
        moving_time = activity.get("moving_time") or ""
        if "." in moving_time:
            activity["moving_time"] = moving_time.split(".")[0]
            changed = True
        if not activity.get("name"):
            activity["name"] = auto_name(activity.get("start_date_local", ""))
            changed = True
    if changed:
        with open(JSON_FILE, "w") as f:
            json.dump(activities, f)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--account", default=os.getenv("COROS_ACCOUNT"))
    parser.add_argument("--password", default=os.getenv("COROS_PASSWORD"))
    parser.add_argument(
        "--issuer", default=os.getenv("COROS_MCP_ISSUER", DEFAULT_ISSUER)
    )
    parser.add_argument(
        "--start-date",
        help="first day to sync, yyyyMMdd (default: newest local activity - 2 days)",
    )
    parser.add_argument(
        "--end-date", help="last day to sync, yyyyMMdd (default: today)"
    )
    parser.add_argument(
        "--max-downloads",
        type=int,
        default=45,
        help="stop after this many new FIT files (COROS MCP cap is 50/day)",
    )
    parser.add_argument(
        "--all-sports",
        action="store_true",
        help="sync every sport type instead of running only",
    )
    args = parser.parse_args()

    if not args.account or not args.password:
        parser.error("COROS account/password required (args or env)")

    start = (
        datetime.datetime.strptime(args.start_date, "%Y%m%d").date()
        if args.start_date
        else last_synced_date()
    )
    end = (
        datetime.datetime.strptime(args.end_date, "%Y%m%d").date()
        if args.end_date
        else datetime.date.today()
    )
    start_s, end_s = start.strftime("%Y%m%d"), end.strftime("%Y%m%d")
    log(f"syncing {start_s} -> {end_s} from {args.issuer}")

    os.makedirs(FIT_FOLDER, exist_ok=True)
    token = get_token(args.issuer, args.account, args.password)

    sport_types = None if args.all_sports else RUNNING_SPORT_TYPES
    try:
        labels = list_activity_labels(token, start_s, end_s, sport_types)
    except RuntimeError as exc:
        # Expired/revoked token: log in again once.
        log(str(exc))
        token = login(args.issuer, args.account, args.password)
        labels = list_activity_labels(token, start_s, end_s, sport_types)

    have = downloaded_label_ids(FIT_FOLDER) | processed_label_ids()
    todo = [item for item in labels if str(item[0]) not in have]
    log(f"{len(have)} FIT files already present, {len(todo)} to fetch")

    fetched = 0
    fetched_ids = []
    quota_blocked = 0
    capped = False
    for label_id, sport_type, _ in todo:
        if fetched >= args.max_downloads:
            log(
                f"reached --max-downloads {args.max_downloads}; "
                "remaining activities will be picked up by the next run"
            )
            capped = True
            break
        try:
            url = fit_url_for(token, label_id, sport_type)
        except RuntimeError as exc:
            log(f"skip {label_id}: {exc}")
            if "daily limit" in str(exc):
                quota_blocked += 1
            if "anomalies" in str(exc):
                # Gateway throttling / context guard: stop politely.
                break
            continue
        if not url:
            log(f"skip {label_id}: no FIT url returned")
            continue
        try:
            path, created = download_fit(url, FIT_FOLDER)
            if created:
                fetched += 1
                fetched_ids.append(str(label_id))
                log(f"downloaded {os.path.basename(path)}")
        except RuntimeError as exc:
            log(str(exc))
            if "daily limit" in str(exc):
                quota_blocked += 1
        time.sleep(0.2)

    if capped and todo[-1][2]:
        # Newest-first listing: the tail holds the oldest pending activity.
        write_cursor(todo[-1][2].replace("-", ""))
    else:
        clear_cursor()

    log(f"fetched {fetched} new FIT files")
    make_activities_file(SQL_FILE, FIT_FOLDER, JSON_FILE, "fit")
    tidy_generated_json()
    try:
        from dedupe_activities import dedupe_activities

        dedupe_activities(
            JSON_FILE,
            SQL_FILE,
            execute=True,
            quiet=False,
            sport=getattr(args, "sport", "running"),
        )
    except Exception as exc:
        log(f"dedupe_activities failed: {exc}")
    mark_processed(fetched_ids)
    log("activities.json rebuilt")
    if quota_blocked:
        print(
            f"::warning::COROS 50/day FIT quota reached; "
            f"{quota_blocked} activities deferred to the next run"
        )


if __name__ == "__main__":
    main()
