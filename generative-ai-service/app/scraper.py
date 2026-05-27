import logging

import requests

from .secrets import get_github_token

logger = logging.getLogger(__name__)

_GRAPHQL_URL = "https://api.github.com/graphql"
_TIMEOUT = 15


def _repo_owner_name(github_url: str) -> tuple[str, str] | None:
    """Extract (owner, repo) from a GitHub URL."""
    try:
        path = github_url.rstrip("/").split("github.com/")[1]
        owner, repo = path.split("/", 1)
        return owner, repo
    except Exception:
        return None


def _build_query(targets: dict[str, tuple[str, str]]) -> str:
    """
    Build a batched GraphQL query to fetch READMEs for all selected projects.
    Each project gets an alias like r0, r1, ... to identify results.
    """
    fragments = []
    for alias, (owner, repo) in targets.items():
        fragments.append(f"""
        {alias}: repository(owner: "{owner}", name: "{repo}") {{
            object(expression: "HEAD:README.md") {{
                ... on Blob {{ text }}
            }}
        }}""")
    return "query {" + "\n".join(fragments) + "\n}"


def fetch_readmes(github_projects: dict, selected: list[str]) -> dict[str, str]:
    """
    Fetch READMEs for selected projects in a single GitHub GraphQL request.

    Args:
        github_projects: { project_name: { "url": "...", "summary": "..." } }
        selected:        project names chosen by the first Gemini call

    Returns:
        { project_name: readme_text } — projects with no README are omitted
    """
    try:
        token = get_github_token()
    except Exception:
        logger.exception("Failed to fetch github_token from Secret Manager")
        return {}

    # Map alias -> (project_name, owner, repo)
    alias_map: dict[str, tuple[str, str, str]] = {}
    for i, name in enumerate(selected):
        entry = github_projects.get(name)
        if not entry or not entry.get("url"):
            logger.warning("No GitHub URL for project %s, skipping", name)
            continue
        parsed = _repo_owner_name(entry["url"])
        if not parsed:
            logger.warning("Could not parse GitHub URL for project %s, skipping", name)
            continue
        owner, repo = parsed
        alias_map[f"r{i}"] = (name, owner, repo)

    if not alias_map:
        return {}

    query_targets = {alias: (owner, repo) for alias, (_, owner, repo) in alias_map.items()}
    query = _build_query(query_targets)

    try:
        resp = requests.post(
            _GRAPHQL_URL,
            json={"query": query},
            headers={"Authorization": f"Bearer {token}"},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json().get("data", {})
    except Exception:
        logger.exception("GitHub GraphQL request failed")
        return {}

    readmes: dict[str, str] = {}
    for alias, (project_name, _, _) in alias_map.items():
        repo_data = data.get(alias)
        if not repo_data:
            logger.warning("No data returned for project %s", project_name)
            continue
        obj = repo_data.get("object")
        if not obj or not obj.get("text"):
            logger.warning("README not found for project %s", project_name)
            continue
        readmes[project_name] = obj["text"]

    return readmes
