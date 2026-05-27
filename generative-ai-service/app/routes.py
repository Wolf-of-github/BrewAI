import logging
import os
import time

from flask import Blueprint, jsonify, request
from google.cloud import firestore

from .ai import check_inputs, detect_intent, edit_resume_tex, extract_job_metadata, generate_resume_latex, select_projects
from .context import fetch_context, get_cached_projects, update_context
from .gcs import BUCKET, fetch_rendered_resume, fetch_user_files, upload_rendered_resume
from .renderer import compile_and_upload_pdf, render_and_upload
from .scraper import fetch_readmes

bp = Blueprint("main", __name__)
logger = logging.getLogger(__name__)


def _rendered_resume_gcs_uri(user_id: str, draft_id: str) -> str:
    return f"gs://{BUCKET}/rendered_resume/{user_id}/{draft_id}.pdf"


db = firestore.Client(project=os.environ.get("GCP_PROJECT"), database="(default)")
JOBS = db.collection("generative-ai-service-jobs")
DRAFTS = db.collection("drafts")
STATS = db.collection("generative-ai-service-data").document("stats")

_MAX_JOBS_PER_DRAFT = 6  # fallback: 1 initial brew + 5 tweaks


def _job_ref(draft_id: str, job_id: str):
    """Returns a reference to JOBS/{draft_id}/jobs/{job_id}."""
    return JOBS.document(draft_id).collection("jobs").document(job_id)


def _draft_job_count(draft_id: str) -> int:
    """Count completed/running/failed jobs under this draft."""
    jobs = JOBS.document(draft_id).collection("jobs").get()
    return len(jobs)


@bp.get("/health")
def health():
    errors = []

    # Ping Firestore
    try:
        db.collection("generative-ai-service-data").document("stats").get()
    except Exception:
        logger.exception("Health check: Firestore ping failed")
        errors.append("firestore")

    # Ping Redis
    try:
        from .context import get_history
        get_history("health-check").messages
    except Exception:
        logger.exception("Health check: Redis ping failed")
        errors.append("redis")

    if errors:
        return jsonify({"status": "unhealthy", "failed": errors}), 503
    return jsonify({"status": "ok"}), 200


@bp.post("/tasks/generate")
def generate():
    # Entry point for Cloud Tasks. Receives a generation job payload via HTTP POST.
    # Expected payload: { "job_id": "<unique id>", "draft_id": "...", "user_id": "...", ... }
    payload = request.get_json(silent=True) or {}
    job_id = payload.get("job_id")
    draft_id = payload.get("draft_id")

    if not job_id:
        return jsonify({"error": "job_id is required"}), 400
    if not draft_id:
        return jsonify({"error": "draft_id is required"}), 400

    ref = _job_ref(draft_id, job_id)

    # Idempotency check — if this job already completed on a previous attempt,
    # return 200 immediately so Cloud Tasks doesn't retry a finished job.
    doc = ref.get()
    if doc.exists and doc.to_dict().get("status") == "completed":
        logger.info("Job %s already completed, skipping", job_id)
        return jsonify({"status": "skipped", "job_id": job_id}), 200

    # Per-draft job limit — count existing subdocs before allowing this job.
    # Gateway passes max_tweaks (user's per-draft limit); add 1 for initial brew.
    # _MAX_JOBS_PER_DRAFT is the fallback when field is absent (legacy tasks).
    max_tweaks = payload.get("max_tweaks")
    job_limit = (int(max_tweaks) + 1) if max_tweaks is not None else _MAX_JOBS_PER_DRAFT
    job_count = _draft_job_count(draft_id)
    if job_count >= job_limit:
        logger.warning("Job %s rejected — draft %s has reached the %d-job limit", job_id, draft_id, job_limit)
        ref.set({
            "job_id": job_id,
            "draft_id": draft_id,
            "user_id": payload.get("user_id"),
            "status": "rejected",
            "error": f"Draft job limit of {job_limit} reached",
            "started_at": firestore.SERVER_TIMESTAMP,
        })
        DRAFTS.document(draft_id).set(
            {"status": "completed", "error": f"You've used all {job_limit - 1} tweaks for this brew. Please start a new brew."},
            merge=True,
        )
        return jsonify({"status": "rejected", "reason": "job_limit_reached"}), 200

    # Write initial job state. Uses set() so retries cleanly overwrite any
    # previous "failed" state from an earlier attempt.
    # No TTL — job history is kept permanently.
    ref.set({
        "job_id": job_id,
        "draft_id": draft_id,
        "user_id": payload.get("user_id"),
        "status": "running",
        "started_at": firestore.SERVER_TIMESTAMP,
    })

    # Atomically increment the global job counter in the stats document.
    STATS.set({
        "total_jobs": firestore.Increment(1),
        "last_updated": firestore.SERVER_TIMESTAMP,
    }, merge=True)

    logger.info("Job %s started", job_id)

    try:
        user_id = payload.get("user_id")
        jd = payload.get("jd")
        prompt = payload.get("prompt")
        one_page = bool(payload.get("one_page", False))

        if not user_id:
            return jsonify({"error": "user_id is required"}), 400
        if not jd:
            return jsonify({"error": "jd is required"}), 400

        # Length guards
        if len(jd) > 15000:
            return jsonify({"error": "jd exceeds the 15,000 character limit"}), 400
        if prompt and len(prompt) > 3000:
            return jsonify({"error": "prompt exceeds the 3,000 character limit"}), 400

        # Safety check — detect prompt injection in JD and user prompt
        if not check_inputs(jd, prompt):
            logger.warning("Job %s rejected — safety check failed", job_id)
            ref.set({
                "job_id": job_id,
                "draft_id": draft_id,
                "user_id": user_id,
                "status": "rejected",
                "error": "Input failed safety check",
                "started_at": firestore.SERVER_TIMESTAMP,
            })
            # Check if rendered .tex already exists — if so this was a tweak
            # on a completed draft. Restore completed so the user can retry
            # with a different prompt rather than permanently breaking the draft.
            existing_tex = fetch_rendered_resume(user_id, draft_id)
            if existing_tex:
                DRAFTS.document(draft_id).set({
                    "status": "completed",
                    "error": "Input failed safety check",
                    "instructions": firestore.ArrayRemove([prompt]),
                }, merge=True)
            else:
                DRAFTS.document(draft_id).set({"status": "failed", "error": "Input failed safety check"}, merge=True)
            STATS.set({
                "total_jobs": firestore.Increment(1),
                "last_updated": firestore.SERVER_TIMESTAMP,
            }, merge=True)
            return jsonify({"error": "Input failed safety check"}), 400

        from concurrent.futures import ThreadPoolExecutor

        timings = {}
        pipeline_start = time.perf_counter()

        # ── Step 1: Check if rendered .tex exists ─────────────────────────────
        t0 = time.perf_counter()
        rendered_tex = fetch_rendered_resume(user_id, draft_id)
        timings["fetch_tex_s"] = round(time.perf_counter() - t0, 2)
        logger.info("Job %s | [fetch_tex] %.2fs | rendered_tex=%s",
                    job_id, timings["fetch_tex_s"], rendered_tex is not None)

        # ── Extract job metadata on new drafts only ────────────────────────────
        if not rendered_tex:
            company, role = extract_job_metadata(jd)
            DRAFTS.document(draft_id).set({"company": company, "role": role}, merge=True)
            logger.info("Job %s | metadata — company=%s role=%s", job_id, company, role)

        # ── Step 2: Intent detection (only if .tex exists and prompt given) ────
        intent = None
        if rendered_tex and prompt:
            t1 = time.perf_counter()
            intent = detect_intent(prompt)
            timings["intent_s"] = round(time.perf_counter() - t1, 2)
            logger.info("Job %s | [call_1a] %.2fs | intent: %s", job_id, timings["intent_s"], intent)

        # ── Path: tweak ───────────────────────────────────────────────────────
        # .tex exists + intent is tweak → surgical edit, no project fetch needed
        if intent == "tweak":
            t2 = time.perf_counter()
            edited_tex = edit_resume_tex(rendered_tex, prompt, jd)
            timings["llm_edit_s"] = round(time.perf_counter() - t2, 2)
            logger.info("Job %s | [call_1c] %.2fs | tweak complete", job_id, timings["llm_edit_s"])

            t3 = time.perf_counter()
            with ThreadPoolExecutor(max_workers=3) as pool:
                f_upload = pool.submit(upload_rendered_resume, user_id, draft_id, edited_tex)
                f_pdf = pool.submit(compile_and_upload_pdf, user_id, draft_id, edited_tex)
                f_ctx = pool.submit(update_context, draft_id, prompt, jd, [])
            f_upload.result()
            f_pdf.result()
            f_ctx.result()
            timings["write_s"] = round(time.perf_counter() - t3, 2)
            timings["total_s"] = round(time.perf_counter() - pipeline_start, 2)
            logger.info("Job %s | [write] %.2fs | .tex + PDF + Redis updated", job_id, timings["write_s"])

            ref.update({"status": "completed", "completed_at": firestore.SERVER_TIMESTAMP, "rendered_resume_uri": _rendered_resume_gcs_uri(user_id, draft_id), "timings": timings})
            DRAFTS.document(draft_id).set({"status": "completed", "error": firestore.DELETE_FIELD}, merge=True)
            logger.info("Job %s completed (tweak path)", job_id)
            return jsonify({"status": "completed", "job_id": job_id}), 200

        # ── Path: projects ────────────────────────────────────────────────────
        # HTML exists + user wants to add/remove projects → select + scrape + HTML edit
        if intent == "projects":
            t2 = time.perf_counter()
            with ThreadPoolExecutor(max_workers=2) as pool:
                proj_future = pool.submit(lambda: fetch_user_files(user_id)[1])  # github_projects only
                ctx_future = pool.submit(fetch_context, draft_id)
                github_projects = proj_future.result()
                context_messages = ctx_future.result()
            timings["fetch_s"] = round(time.perf_counter() - t2, 2)
            logger.info("Job %s | [fetch] %.2fs | github_projects=%s context_messages=%d",
                        job_id, timings["fetch_s"], github_projects is not None, len(context_messages))

            selected = []
            readmes = {}
            if github_projects:
                t3 = time.perf_counter()
                selected = select_projects(jd, prompt, github_projects, context_messages)
                timings["llm_select_s"] = round(time.perf_counter() - t3, 2)
                logger.info("Job %s | [call_1b] %.2fs | selected: %s", job_id, timings["llm_select_s"], selected)

                if selected:
                    t4 = time.perf_counter()
                    readmes = fetch_readmes(github_projects, selected)
                    timings["scrape_s"] = round(time.perf_counter() - t4, 2)
                    logger.info("Job %s | [scrape] %.2fs | READMEs: %s", job_id, timings["scrape_s"], list(readmes.keys()))

            t5 = time.perf_counter()
            edited_tex = edit_resume_tex(rendered_tex, prompt, jd, readmes=readmes, context_messages=context_messages)
            timings["llm_edit_s"] = round(time.perf_counter() - t5, 2)
            logger.info("Job %s | [call_1c] %.2fs | projects edit complete", job_id, timings["llm_edit_s"])

            t6 = time.perf_counter()
            with ThreadPoolExecutor(max_workers=3) as pool:
                f_upload = pool.submit(upload_rendered_resume, user_id, draft_id, edited_tex)
                f_pdf = pool.submit(compile_and_upload_pdf, user_id, draft_id, edited_tex)
                f_ctx = pool.submit(update_context, draft_id, prompt, jd, selected)
            f_upload.result()
            f_pdf.result()
            f_ctx.result()
            timings["write_s"] = round(time.perf_counter() - t6, 2)
            timings["total_s"] = round(time.perf_counter() - pipeline_start, 2)
            logger.info("Job %s | [write] %.2fs | .tex + PDF + Redis updated", job_id, timings["write_s"])

            ref.update({"status": "completed", "completed_at": firestore.SERVER_TIMESTAMP, "rendered_resume_uri": _rendered_resume_gcs_uri(user_id, draft_id), "timings": timings})
            DRAFTS.document(draft_id).set({"status": "completed", "error": firestore.DELETE_FIELD}, merge=True)
            logger.info("Job %s completed (projects path)", job_id)
            return jsonify({"status": "completed", "job_id": job_id}), 200

        # ── Path: full pipeline (new job or revamp) ───────────────────────────
        # No .tex, or intent is "revamp" → fetch all inputs, run full pipeline
        t0 = time.perf_counter()
        with ThreadPoolExecutor(max_workers=2) as pool:
            gcs_future = pool.submit(fetch_user_files, user_id)
            ctx_future = pool.submit(fetch_context, draft_id)
            resume, github_projects = gcs_future.result()
            context_messages = ctx_future.result()
        timings["fetch_s"] = round(time.perf_counter() - t0, 2)
        logger.info("Job %s | [fetch] %.2fs | resume=%s github_projects=%s context_messages=%d",
                    job_id, timings["fetch_s"],
                    resume is not None, github_projects is not None, len(context_messages))

        readmes = {}
        selected = []
        if github_projects:
            cached = get_cached_projects(context_messages)
            if cached and not prompt:
                selected = [p for p in cached if p in github_projects]
                logger.info("Job %s | [call_1b] skipped — reusing cached: %s", job_id, selected)
            else:
                t1 = time.perf_counter()
                selected = select_projects(jd, prompt, github_projects, context_messages)
                timings["llm_select_s"] = round(time.perf_counter() - t1, 2)
                logger.info("Job %s | [call_1b] %.2fs | selected: %s", job_id, timings["llm_select_s"], selected)

            if selected:
                t2 = time.perf_counter()
                readmes = fetch_readmes(github_projects, selected)
                timings["scrape_s"] = round(time.perf_counter() - t2, 2)
                logger.info("Job %s | [scrape] %.2fs | READMEs: %s", job_id, timings["scrape_s"], list(readmes.keys()))

        t3 = time.perf_counter()
        tex = generate_resume_latex(
            resume=resume or {},
            jd=jd,
            readmes=readmes,
            rendered_tex=rendered_tex,
            user_prompt=prompt,
            context_messages=context_messages,
            one_page=one_page,
        )
        timings["llm_generate_s"] = round(time.perf_counter() - t3, 2)
        logger.info("Job %s | [call_2] %.2fs | tex_len=%d", job_id, timings["llm_generate_s"], len(tex))

        if not tex:
            raise RuntimeError("generate_resume_latex returned empty output")

        t4 = time.perf_counter()
        with ThreadPoolExecutor(max_workers=2) as pool:
            f_ctx = pool.submit(update_context, draft_id, prompt, jd, selected if github_projects else [])
            f_render = pool.submit(render_and_upload, user_id, draft_id, tex)
        f_ctx.result()
        f_render.result()
        timings["write_s"] = round(time.perf_counter() - t4, 2)
        timings["total_s"] = round(time.perf_counter() - pipeline_start, 2)
        logger.info("Job %s | [write] %.2fs | GCS + Redis updated", job_id, timings["write_s"])

        ref.update({"status": "completed", "completed_at": firestore.SERVER_TIMESTAMP, "rendered_resume_uri": _rendered_resume_gcs_uri(user_id, draft_id), "timings": timings})
        DRAFTS.document(draft_id).set({"status": "completed"}, merge=True)
        logger.info("Job %s completed (full pipeline)", job_id)
        return jsonify({"status": "completed", "job_id": job_id}), 200

    except Exception as e:
        # Mark job as failed in Firestore, then re-raise so Flask returns 500.
        # Cloud Tasks will see the 500 and schedule a retry.
        logger.exception("Job %s failed", job_id)
        try:
            ref.update({"status": "failed", "error": str(e)})
            DRAFTS.document(draft_id).set({"status": "failed", "error": str(e)}, merge=True)
        except Exception:
            logger.exception("Job %s — failed to update Firestore status after failure", job_id)
        raise
