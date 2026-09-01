#!/usr/bin/env python3
"""
ClickUp CLI Tool & Integration Helper for Antigravity / Buyerly.
Uses standard Python library (urllib) to interact with ClickUp API v2.
"""

import sys
import os
import json
import argparse
import urllib.request
import urllib.error
import urllib.parse
from typing import Optional, Dict, Any, List
from pathlib import Path

# Load environment variables from .env if present
def load_dotenv():
    env_file = Path(__file__).resolve().parents[3] / ".env"
    if env_file.exists():
        with open(env_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip("'\"")
                if k not in os.environ:
                    os.environ[k] = v

load_dotenv()

API_BASE = "https://api.clickup.com/api/v2"
DEFAULT_TEAM_ID = os.environ.get("CLICKUP_TEAM_ID", "90183003824")
DEFAULT_SPACE_ID = os.environ.get("CLICKUP_SPACE_ID", "901812665004")
API_KEY = os.environ.get("CLICKUP_API_KEY", "pk_234186141_Y0TZ85TLHD1EWPPVYA8JNCVHF2WFBATN")

def get_headers() -> Dict[str, str]:
    if not API_KEY:
        raise ValueError("CLICKUP_API_KEY is not set in environment or .env")
    return {
        "Authorization": API_KEY,
        "Content-Type": "application/json"
    }

def api_request(endpoint: str, method: str = "GET", data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    url = f"{API_BASE}{endpoint}" if endpoint.startswith("/") else f"{API_BASE}/{endpoint}"
    headers = get_headers()
    body = json.dumps(data).encode("utf-8") if data is not None else None
    
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode("utf-8")
            return json.loads(res_body) if res_body else {}
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")
        try:
            err_json = json.loads(error_body)
            err_msg = err_json.get("err") or err_json.get("ECODE") or error_body
        except Exception:
            err_msg = error_body
        raise RuntimeError(f"ClickUp API error [{e.code}]: {err_msg}")
    except Exception as e:
        raise RuntimeError(f"Request failed: {str(e)}")

# High-level operations
def get_teams() -> List[Dict[str, Any]]:
    res = api_request("/team")
    return res.get("teams", [])

def get_spaces(team_id: str = DEFAULT_TEAM_ID) -> List[Dict[str, Any]]:
    res = api_request(f"/team/{team_id}/space")
    return res.get("spaces", [])

def get_folders_and_lists(space_id: str = DEFAULT_SPACE_ID) -> Dict[str, Any]:
    folders = api_request(f"/space/{space_id}/folder").get("folders", [])
    folderless_lists = api_request(f"/space/{space_id}/list").get("lists", [])
    return {
        "folders": folders,
        "folderless_lists": folderless_lists
    }

def list_tasks(
    team_id: str = DEFAULT_TEAM_ID,
    list_id: Optional[str] = None,
    statuses: Optional[List[str]] = None,
    include_closed: bool = True,
    subtasks: bool = True
) -> List[Dict[str, Any]]:
    if list_id:
        endpoint = f"/list/{list_id}/task?include_closed={'true' if include_closed else 'false'}&subtasks={'true' if subtasks else 'false'}"
        if statuses:
            for s in statuses:
                endpoint += f"&statuses[]={urllib.parse.quote(s)}"
        res = api_request(endpoint)
    else:
        endpoint = f"/team/{team_id}/task?include_closed={'true' if include_closed else 'false'}&subtasks={'true' if subtasks else 'false'}"
        if statuses:
            for s in statuses:
                endpoint += f"&statuses[]={urllib.parse.quote(s)}"
        res = api_request(endpoint)
    return res.get("tasks", [])

def get_task(task_id: str, include_subtasks: bool = True) -> Dict[str, Any]:
    task_id = task_id.lstrip("#")
    res = api_request(f"/task/{task_id}?include_subtasks={'true' if include_subtasks else 'false'}")
    return res

def get_task_comments(task_id: str) -> List[Dict[str, Any]]:
    task_id = task_id.lstrip("#")
    res = api_request(f"/task/{task_id}/comment")
    return res.get("comments", [])

def update_task_status(task_id: str, status: str) -> Dict[str, Any]:
    task_id = task_id.lstrip("#")
    data = {"status": status}
    return api_request(f"/task/{task_id}", method="PUT", data=data)

def add_task_comment(task_id: str, comment_text: str, notify_all: bool = False) -> Dict[str, Any]:
    task_id = task_id.lstrip("#")
    data = {
        "comment_text": comment_text,
        "notify_all": notify_all
    }
    return api_request(f"/task/{task_id}/comment", method="POST", data=data)

def create_task(list_id: str, name: str, description: str = "", priority: Optional[int] = None, status: Optional[str] = None, parent: Optional[str] = None) -> Dict[str, Any]:
    data = {
        "name": name,
        "description": description
    }
    if priority is not None:
        data["priority"] = priority
    if status is not None:
        data["status"] = status
    if parent is not None:
        data["parent"] = parent.lstrip("#")
    return api_request(f"/list/{list_id}/task", method="POST", data=data)

def search_tasks(query: str, team_id: str = DEFAULT_TEAM_ID) -> List[Dict[str, Any]]:
    all_tasks = list_tasks(team_id=team_id, include_closed=True, subtasks=True)
    q = query.lower()
    matches = []
    for t in all_tasks:
        name = t.get("name", "").lower()
        desc = (t.get("description") or "").lower()
        tid = t.get("id", "").lower()
        custom_id = (t.get("custom_id") or "").lower()
        if q in name or q in desc or q in tid or q in custom_id:
            matches.append(t)
    return matches

def main():
    parser = argparse.ArgumentParser(description="Buyerly ClickUp Tool")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # Structure command
    subparsers.add_parser("structure", help="Show workspace folders and lists")

    # List tasks command
    list_p = subparsers.add_parser("list", help="List tasks")
    list_p.add_argument("--list-id", help="Filter by List ID")
    list_p.add_argument("--status", help="Filter by status (comma-separated)")

    # Get task command
    get_p = subparsers.add_parser("get", help="Get task details")
    get_p.add_argument("task_id", help="Task ID (e.g. 86eyr5qbd)")
    get_p.add_argument("--comments", action="store_true", help="Include comments")

    # Status command
    status_p = subparsers.add_parser("status", help="Update task status")
    status_p.add_argument("task_id", help="Task ID")
    status_p.add_argument("status", help="New status (e.g. 'in progress', 'in rev', 'complete')")

    # Comment command
    comment_p = subparsers.add_parser("comment", help="Add comment to task")
    comment_p.add_argument("task_id", help="Task ID")
    comment_p.add_argument("text", help="Comment text")

    # Search command
    search_p = subparsers.add_parser("search", help="Search tasks by keyword")
    search_p.add_argument("query", help="Search query")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    try:
        if args.command == "structure":
            data = get_folders_and_lists()
            print(json.dumps(data, indent=2, ensure_ascii=False))
        elif args.command == "list":
            statuses = [s.strip() for s in args.status.split(",")] if args.status else None
            tasks = list_tasks(list_id=args.list_id, statuses=statuses)
            for t in tasks:
                tid = t.get("id")
                tname = t.get("name")
                tstat = t.get("status", {}).get("status")
                tlist = t.get("list", {}).get("name")
                tprio = (t.get("priority") or {}).get("priority", "none")
                print(f"[{tid}] ({tstat} | {tprio}) {tname} [{tlist}]")
        elif args.command == "get":
            task = get_task(args.task_id)
            print(json.dumps(task, indent=2, ensure_ascii=False))
            if args.comments:
                comments = get_task_comments(args.task_id)
                print("\n--- COMMENTS ---")
                print(json.dumps(comments, indent=2, ensure_ascii=False))
        elif args.command == "status":
            res = update_task_status(args.task_id, args.status)
            print(f"Task {args.task_id} status updated to: {args.status}")
        elif args.command == "comment":
            res = add_task_comment(args.task_id, args.text)
            print(f"Comment added to task {args.task_id}")
        elif args.command == "search":
            matches = search_tasks(args.query)
            print(f"Found {len(matches)} matching tasks for '{args.query}':")
            for t in matches:
                tid = t.get("id")
                tname = t.get("name")
                tstat = t.get("status", {}).get("status")
                tlist = t.get("list", {}).get("name")
                print(f"[{tid}] ({tstat}) {tname} [{tlist}]")
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
