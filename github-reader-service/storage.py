import os
import json
from google.cloud import storage, firestore

BUCKET_NAME = os.environ.get("GCS_BUCKET_NAME")

if not BUCKET_NAME:
    raise RuntimeError("GCS_BUCKET_NAME environment variable is required")

_storage_client = storage.Client()
_firestore_client = firestore.Client()


def save_projects_to_gcs(user_id: str, projects: dict) -> str:
    """
    Upload { repo_name: { url, summary } } JSON to GCS.
    Always overwrites the single file for this user.
    """
    path = f"github_projects/{user_id}.json"
    blob = _storage_client.bucket(BUCKET_NAME).blob(path)

    if blob.exists():
        blob.delete()
        print(f"[storage] Deleted existing file path={path}", flush=True)

    blob.upload_from_string(
        json.dumps(projects, indent=2, ensure_ascii=False),
        content_type="application/json",
    )

    gcs_url = f"gs://{BUCKET_NAME}/{path}"
    print(f"[storage] Saved to GCS path={gcs_url}", flush=True)
    return gcs_url


def mark_github_processing(user_id: str):
    # Overwrite the entire doc so the old status/gcsPath are gone.
    # The frontend snapshot waits for status=completed — clearing it here
    # prevents the snapshot from resolving on a stale completed state.
    _firestore_client.collection("githubReadmes").document(user_id).set(
        {"userId": user_id, "status": "processing", "updatedAt": firestore.SERVER_TIMESTAMP},
        merge=True,
    )
    print(f"[storage] Firestore githubReadmes marked processing userId={user_id}", flush=True)


def mark_github_completed_empty(user_id: str):
    _firestore_client.collection("githubReadmes").document(user_id).set(
        {
            "userId": user_id,
            "reposFound": 0,
            "status": "completed",
            "updatedAt": firestore.SERVER_TIMESTAMP,
        },
        merge=True,
    )
    print(f"[storage] Firestore githubReadmes marked completed (no repos) userId={user_id}", flush=True)


def update_firestore(user_id: str, gcs_url: str, repos_found: int):
    path = f"github_projects/{user_id}.json"
    _firestore_client.collection("githubReadmes").document(user_id).set(
        {
            "userId": user_id,
            "gcsPath": path,
            "gcsUrl": gcs_url,
            "reposFound": repos_found,
            "status": "completed",
            "updatedAt": firestore.SERVER_TIMESTAMP,
        },
        merge=True,
    )
    print(f"[storage] Firestore githubReadmes updated userId={user_id}", flush=True)
