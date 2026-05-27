import re
import sys
import json
import requests
from datetime import datetime, timezone

GITHUB_GRAPHQL_URL = "https://api.github.com/graphql"
GITHUB_USERNAME_RE = re.compile(r'^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,37}[a-zA-Z0-9])?$')

TOP_N = 20
THREE_YEARS_DAYS = 3 * 365
_MAX_README_CHARS = 5_000   # per-repo README cap
_MAX_TOTAL_CHARS  = 50_000  # total across all repos before Gemini


def validate_github_username(username: str):
    if not GITHUB_USERNAME_RE.match(username):
        raise ValueError(f"Invalid GitHub username: {username!r}")


def post_graphql(token: str, query: str) -> dict:
    headers = {
        "Authorization": f"bearer {token}",
        "Content-Type": "application/json",
        "User-Agent": "py-github-reader",
    }

    response = requests.post(
        GITHUB_GRAPHQL_URL,
        headers=headers,
        json={"query": query},
        timeout=30,
    )

    if response.status_code != 200:
        print("HTTP Error:", response.status_code, file=sys.stderr)
        print(response.text, file=sys.stderr)
        response.raise_for_status()

    return response.json()


def _score_repo(repo: dict, now: datetime) -> float:
    """
    Score = stars + forks + recency_score + commit_score
    - recency_score: 10 if pushed within 6 months, 7 if 1yr, 4 if 2yr, 1 if 3yr
    - commit_score: log10(commits + 1) * 5, capped at 20
    """
    stars = repo.get("stargazerCount", 0)
    forks = repo.get("forkCount", 0)

    pushed_at = repo.get("pushedAt")
    recency_score = 0
    if pushed_at:
        days_ago = (now - datetime.fromisoformat(pushed_at.replace("Z", "+00:00"))).days
        if days_ago <= 180:
            recency_score = 10
        elif days_ago <= 365:
            recency_score = 7
        elif days_ago <= 730:
            recency_score = 4
        else:
            recency_score = 1

    commits = repo.get("commits", 0)
    import math
    commit_score = min(math.log10(commits + 1) * 5, 20)

    return stars + forks + recency_score + commit_score


def fetch_repo_readmes(token: str, github_user_id: str) -> dict:
    """
    Fetch public repos, score them, select top N, then fetch READMEs.
    Returns: { repo_name: { "url": str, "readme": str, "description": str } }
    Only repos with a README are included.
    """
    validate_github_username(github_user_id)

    repo_query = f"""
    query {{
      user(login: "{github_user_id}") {{
        repositories(first: 100, privacy: PUBLIC) {{
          nodes {{
            name
            url
            description
            stargazerCount
            forkCount
            pushedAt
            defaultBranchRef {{
              target {{
                ... on Commit {{
                  history {{
                    totalCount
                  }}
                }}
              }}
            }}
          }}
        }}
      }}
    }}
    """

    repo_response = post_graphql(token, repo_query)

    try:
        nodes = repo_response["data"]["user"]["repositories"]["nodes"]
    except Exception:
        print("Failed to parse repo list response:", file=sys.stderr)
        print(json.dumps(repo_response, indent=2), file=sys.stderr)
        raise RuntimeError("Failed to parse repository list from GitHub response")

    if not nodes:
        return {}

    now = datetime.now(timezone.utc)
    three_years_ago_days = THREE_YEARS_DAYS

    # Enrich nodes with commit count and filter stale repos
    active_repos = []
    for node in nodes:
        pushed_at = node.get("pushedAt")
        if pushed_at:
            days_ago = (now - datetime.fromisoformat(pushed_at.replace("Z", "+00:00"))).days
            if days_ago > three_years_ago_days:
                continue  # skip stale repos

        commits = 0
        try:
            commits = node["defaultBranchRef"]["target"]["history"]["totalCount"]
        except (TypeError, KeyError):
            pass
        node["commits"] = commits
        active_repos.append(node)

    if not active_repos:
        return {}

    # Score and take top N
    active_repos.sort(key=lambda r: _score_repo(r, now), reverse=True)
    top_repos = active_repos[:TOP_N]

    print(f"[github] active={len(active_repos)} top={len(top_repos)} (of {len(nodes)} total)", flush=True)

    # Batch fetch READMEs for top repos only
    alias_fields = []
    for i, repo in enumerate(top_repos):
        repo_name = repo["name"]
        alias_fields.append(f"""
        repo{i}: repository(owner: "{github_user_id}", name: "{repo_name}") {{
          object(expression: "HEAD:README.md") {{
            ... on Blob {{
              text
            }}
          }}
        }}
        """)

    batch_query = "query {\n" + "\n".join(alias_fields) + "\n}"
    readme_response = post_graphql(token, batch_query)

    data = readme_response.get("data", {})
    output = {}

    total_chars = 0
    for i, repo in enumerate(top_repos):
        if total_chars >= _MAX_TOTAL_CHARS:
            print(f"[github] total char cap reached ({_MAX_TOTAL_CHARS}), stopping at repo {i}", flush=True)
            break
        repo_name = repo["name"]
        repo_obj = data.get(f"repo{i}")
        if not repo_obj:
            continue
        obj = repo_obj.get("object")
        if isinstance(obj, dict):
            text = obj.get("text")
            if text:
                capped = text[:_MAX_README_CHARS]
                total_chars += len(capped)
                output[repo_name] = {
                    "url": repo["url"],
                    "description": repo.get("description") or "",
                    "readme": capped,
                }

    print(f"[github] output: {len(output)} repos, {total_chars} total chars", flush=True)
    return output
