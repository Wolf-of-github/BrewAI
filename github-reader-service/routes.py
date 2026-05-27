import traceback
from flask import Blueprint, request, jsonify
from github_client import fetch_repo_readmes
from storage import save_projects_to_gcs, update_firestore, mark_github_processing, mark_github_completed_empty
from ai import select_projects, summarise_readme

bp = Blueprint("github", __name__)
GITHUB_TOKEN: str = ""


def set_token(token: str):
    global GITHUB_TOKEN
    GITHUB_TOKEN = token


@bp.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"}), 200


@bp.route("/process", methods=["POST"])
def process():
    body = request.get_json(silent=True) or {}
    github_user_id = body.get("github_user_id")
    user_id = body.get("user_id")

    if not github_user_id:
        return jsonify({"error": "github_user_id is required"}), 400
    if not user_id:
        return jsonify({"error": "user_id is required"}), 400

    print(f"[process] START github_user_id={github_user_id} user_id={user_id}", flush=True)
    mark_github_processing(user_id)

    try:
        raw_repos = fetch_repo_readmes(GITHUB_TOKEN, github_user_id)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        print(f"[process] FAILED fetching repos github_user_id={github_user_id} error={e}", flush=True)
        return jsonify({"error": "Failed to fetch GitHub repositories"}), 502

    print(f"[process] Fetched repos_with_readme={len(raw_repos)}", flush=True)

    if not raw_repos:
        mark_github_completed_empty(user_id)
        return jsonify({"ack": True, "repos_found": 0, "gcs_url": None}), 200

    # Gemini selects meaningful projects from the scored top-N
    repo_meta = [
        {"name": name, "description": data["description"]}
        for name, data in raw_repos.items()
    ]
    selected_names = select_projects(repo_meta)
    selected_repos = {name: raw_repos[name] for name in selected_names if name in raw_repos}

    print(f"[process] Selected repos={len(selected_repos)}", flush=True)

    projects = {}
    for repo_name, repo_data in selected_repos.items():
        print(f"[process] Summarising repo={repo_name}", flush=True)
        summary = summarise_readme(repo_name, repo_data["readme"])
        projects[repo_name] = {
            "url": repo_data["url"],
            "summary": summary,
        }

    print(f"[process] Summarisation complete repos={len(projects)}", flush=True)

    try:
        gcs_url = save_projects_to_gcs(user_id, projects)
        update_firestore(user_id, gcs_url, len(projects))
    except Exception as e:
        print(f"[process] FAILED saving results user_id={user_id} error={e}", flush=True)
        traceback.print_exc()
        return jsonify({"error": "Failed to save results"}), 500

    print(f"[process] DONE user_id={user_id} gcs_url={gcs_url}", flush=True)
    return jsonify({"ack": True, "repos_found": len(projects), "gcs_url": gcs_url}), 200
