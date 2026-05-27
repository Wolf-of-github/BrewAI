import json
import logging
import os

from google.cloud import storage
from google.cloud.exceptions import NotFound

logger = logging.getLogger(__name__)

_client = storage.Client()
BUCKET = os.environ.get("GCS_BUCKET", "brew-prod-artifacts")


def _read_json(blob_path: str) -> dict | None:
    """Download and parse a JSON blob. Returns None if the blob does not exist."""
    try:
        bucket = _client.bucket(BUCKET)
        blob = bucket.blob(blob_path)
        data = blob.download_as_text()
        return json.loads(data)
    except NotFound:
        logger.info("GCS blob not found: %s", blob_path)
        return None
    except Exception:
        logger.exception("Failed to read GCS blob: %s", blob_path)
        return None


def fetch_rendered_resume(user_id: str, draft_id: str) -> str | None:
    """Download the rendered resume .tex source from GCS. Returns None if not found."""
    blob_path = f"rendered_resume/{user_id}/{draft_id}.tex"
    try:
        bucket = _client.bucket(BUCKET)
        blob = bucket.blob(blob_path)
        return blob.download_as_text()
    except NotFound:
        logger.info("No rendered resume found at %s", blob_path)
        return None
    except Exception:
        logger.exception("Failed to fetch rendered resume at %s", blob_path)
        return None


def upload_rendered_resume(user_id: str, draft_id: str, tex: str) -> None:
    """Upload the rendered resume .tex source to GCS."""
    blob_path = f"rendered_resume/{user_id}/{draft_id}.tex"
    try:
        bucket = _client.bucket(BUCKET)
        blob = bucket.blob(blob_path)
        blob.upload_from_string(tex, content_type="text/plain")
        logger.info("Uploaded rendered resume .tex to %s", blob_path)
    except Exception:
        logger.exception("Failed to upload rendered resume to %s", blob_path)
        raise


def upload_rendered_pdf(user_id: str, draft_id: str, pdf: bytes) -> None:
    """Upload the compiled resume PDF to GCS."""
    blob_path = f"rendered_resume/{user_id}/{draft_id}.pdf"
    try:
        bucket = _client.bucket(BUCKET)
        blob = bucket.blob(blob_path)
        blob.upload_from_string(pdf, content_type="application/pdf")
        logger.info("Uploaded rendered resume .pdf to %s", blob_path)
    except Exception:
        logger.exception("Failed to upload rendered resume PDF to %s", blob_path)
        raise


def fetch_user_files(user_id: str) -> tuple[dict | None, dict | None]:
    """
    Fetch user input files from GCS in parallel.

    Returns:
        (resume, github_projects)
        Either may be None if the file does not exist yet.
    """
    from concurrent.futures import ThreadPoolExecutor

    paths = [
        f"parsed_resumes/{user_id}.json",
        f"github_projects/{user_id}.json",
    ]

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(_read_json, paths))

    resume, github_projects = results
    return resume, github_projects
