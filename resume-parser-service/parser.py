import os
import io
import json
import concurrent.futures
from datetime import datetime, timezone

import magic
import pdfplumber
import docx
from google.cloud import storage, firestore

from ai import check_resume_text

BUCKET_NAME = os.environ.get("GCS_BUCKET_NAME")

if not BUCKET_NAME:
    raise RuntimeError("GCS_BUCKET_NAME environment variable is required")

_storage_client = storage.Client()
_firestore_client = firestore.Client()

EXTRACTION_TIMEOUT = 30  # seconds
MAX_TEXT_LENGTH = 50_000  # characters

PDF_MIME = "application/pdf"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
DOC_MIME = "application/msword"


def download_file(gcs_path: str) -> bytes:
    print(f"[parser] Downloading gs://{BUCKET_NAME}/{gcs_path}", flush=True)
    blob = _storage_client.bucket(BUCKET_NAME).blob(gcs_path)
    data = blob.download_as_bytes()
    print(f"[parser] Download complete size={len(data)}", flush=True)
    return data


def delete_raw_file(gcs_path: str):
    try:
        _storage_client.bucket(BUCKET_NAME).blob(gcs_path).delete()
        print(f"[parser] Deleted raw file gs://{BUCKET_NAME}/{gcs_path}", flush=True)
    except Exception as e:
        print(f"[parser] Failed to delete raw file {gcs_path}: {e}", flush=True)


def _extract_pdf(data: bytes) -> tuple[str, list[str]]:
    text_parts = []
    seen = set()
    links = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
            for link in page.hyperlinks:
                uri = link.get("uri", "").strip()
                if uri and uri not in seen:
                    seen.add(uri)
                    links.append(uri)
        text = "\n".join(text_parts)
        print(f"[parser] PDF extraction complete pages={len(pdf.pages)} textLength={len(text)} links={len(links)}", flush=True)
    return text, links


def _extract_docx(data: bytes) -> tuple[str, list[str]]:
    doc = docx.Document(io.BytesIO(data))
    text = "\n".join(para.text for para in doc.paragraphs)
    seen = set()
    links = []
    # Walk all parts (body, headers, footers) to catch every hyperlink relationship
    for part in doc.part.package.iter_parts():
        for rel in part.rels.values():
            if "hyperlink" in rel.reltype:
                url = rel.target_ref.strip()
                if url and url not in seen:
                    seen.add(url)
                    links.append(url)
    print(f"[parser] DOCX extraction complete textLength={len(text)} links={len(links)}", flush=True)
    return text, links


def extract_text(data: bytes) -> tuple[str, list[dict]]:
    mime = magic.from_buffer(data[:2048], mime=True)
    print(f"[parser] Detected MIME type={mime}", flush=True)

    if mime == PDF_MIME:
        fn = _extract_pdf
    elif mime in (DOCX_MIME, DOC_MIME):
        fn = _extract_docx
    else:
        raise ValueError(f"Unsupported file type: {mime}")

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(fn, data)
        try:
            return future.result(timeout=EXTRACTION_TIMEOUT)
        except concurrent.futures.TimeoutError:
            raise TimeoutError(f"Extraction timed out after {EXTRACTION_TIMEOUT}s")


def delete_existing_parsed(user_id: str):
    path = f"parsed_resumes/{user_id}.json"
    blob = _storage_client.bucket(BUCKET_NAME).blob(path)
    if blob.exists():
        blob.delete()
        print(f"[parser] Deleted existing parsed resume for userId={user_id}", flush=True)


def upload_parsed(user_id: str, parsed_content: dict) -> str:
    parsed_path = f"parsed_resumes/{user_id}.json"
    print(f"[parser] Uploading parsed output to gs://{BUCKET_NAME}/{parsed_path}", flush=True)

    blob = _storage_client.bucket(BUCKET_NAME).blob(parsed_path)
    blob.upload_from_string(
        json.dumps(parsed_content, indent=2),
        content_type="application/json"
    )

    print(f"[parser] Parsed output upload complete", flush=True)
    return parsed_path


def clear_uploaded_resume_record(user_id: str, file_id: str):
    """Remove uploadedResumes record so the rejected file doesn't appear in the UI."""
    try:
        doc_ref = _firestore_client.collection("uploadedResumes").document(user_id)
        doc = doc_ref.get()
        if doc.exists and doc.to_dict().get("fileId") == file_id:
            doc_ref.delete()
            print(f"[parser] Cleared uploadedResumes record userId={user_id}", flush=True)
    except Exception as e:
        print(f"[parser] Failed to clear uploadedResumes record: {e}", flush=True)


def write_parse_record(user_id: str, file_id: str, original_name: str,
                       gcs_path: str, gcs_url: str, status: str):
    doc_ref = _firestore_client.collection("parsedResumes").document(user_id)
    doc_ref.set({
        "userId": user_id,
        "fileId": file_id,
        "originalName": original_name,
        "gcsPath": gcs_path,
        "gcsUrl": gcs_url,
        "status": status,
        "parsedAt": firestore.SERVER_TIMESTAMP,
    }, merge=True)
    print(f"[parser] parsedResumes record written userId={user_id} status={status}", flush=True)


def parse_resume(data: dict):
    file_id = data["fileId"]
    user_id = data["userId"]
    gcs_path = data["gcsPath"]
    gcs_url = data.get("gcsUrl")

    print(f"[parser] START fileId={file_id} userId={user_id}", flush=True)

    original_name = gcs_path.split("/")[-1]
    raw_bytes = download_file(gcs_path)
    text, links = extract_text(raw_bytes)

    # Validate extracted text length
    if not text.strip():
        delete_raw_file(gcs_path)
        clear_uploaded_resume_record(user_id, file_id)
        write_parse_record(user_id, file_id, original_name, gcs_path, gcs_url or "", "rejected")
        raise ValueError("Extracted text is empty")

    if len(text) > MAX_TEXT_LENGTH:
        delete_raw_file(gcs_path)
        clear_uploaded_resume_record(user_id, file_id)
        write_parse_record(user_id, file_id, original_name, gcs_path, gcs_url or "", "rejected")
        raise ValueError(f"Extracted text exceeds maximum length ({len(text)} > {MAX_TEXT_LENGTH})")

    # AI safety check
    print(f"[parser] Running safety check fileId={file_id}", flush=True)
    if not check_resume_text(text):
        print(f"[parser] Safety check failed fileId={file_id} — rejecting", flush=True)
        delete_raw_file(gcs_path)
        clear_uploaded_resume_record(user_id, file_id)
        write_parse_record(user_id, file_id, original_name, gcs_path, gcs_url or "", "rejected")
        raise ValueError("Resume text failed safety check")

    # Delete existing parsed resume for this user before uploading new one
    delete_existing_parsed(user_id)

    parsed_content = {
        "fileId": file_id,
        "userId": user_id,
        "originalName": original_name,
        "gcsUrl": gcs_url,
        "parsedAt": datetime.now(timezone.utc).isoformat(),
        "text": text,
        "links": links,  # list of URL strings extracted from the original resume
    }

    parsed_path = upload_parsed(user_id, parsed_content)
    parsed_gcs_url = f"gs://{BUCKET_NAME}/{parsed_path}"
    print(f"[parser] Parsed output at {parsed_gcs_url}", flush=True)

    write_parse_record(user_id, file_id, original_name, parsed_path, parsed_gcs_url, "success")

    print(f"[parser] DONE fileId={file_id}", flush=True)
