import logging
import os
import subprocess
import tempfile

from .gcs import upload_rendered_pdf, upload_rendered_resume

logger = logging.getLogger(__name__)


def compile_latex(tex_source: str) -> bytes:
    """
    Compile a .tex string to PDF using pdflatex.
    Runs pdflatex twice for correct cross-references.
    Returns the PDF bytes.
    Raises on failure if no PDF was produced.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tex_path = os.path.join(tmpdir, "resume.tex")
        pdf_path = os.path.join(tmpdir, "resume.pdf")

        with open(tex_path, "w", encoding="utf-8") as f:
            f.write(tex_source)

        cmd = [
            "pdflatex",
            "-interaction=nonstopmode",
            "-output-directory", tmpdir,
            tex_path,
        ]

        for run in range(2):
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            if result.returncode != 0:
                if not os.path.exists(pdf_path):
                    logger.error("pdflatex run %d failed (rc=%d, no PDF):\n%s", run + 1, result.returncode, result.stdout[-3000:])
                    raise subprocess.CalledProcessError(result.returncode, cmd, result.stdout, result.stderr)
                logger.warning("pdflatex run %d exited %d but PDF exists — continuing", run + 1, result.returncode)

        with open(pdf_path, "rb") as f:
            return f.read()


def render_and_upload(user_id: str, draft_id: str, tex: str) -> None:
    """Compile .tex to PDF and upload both .tex and .pdf to GCS."""
    try:
        pdf = compile_latex(tex)
        upload_rendered_resume(user_id, draft_id, tex)
        upload_rendered_pdf(user_id, draft_id, pdf)
        logger.info("Rendered resume uploaded for user %s draft %s", user_id, draft_id)
    except Exception:
        logger.exception("Failed to render and upload resume for user %s draft %s", user_id, draft_id)
        raise


def compile_and_upload_pdf(user_id: str, draft_id: str, tex: str) -> None:
    """Compile a .tex string to PDF and upload to GCS. Used on tweak/projects paths."""
    try:
        pdf = compile_latex(tex)
        upload_rendered_pdf(user_id, draft_id, pdf)
        logger.info("Compiled and uploaded PDF for user %s draft %s", user_id, draft_id)
    except Exception:
        logger.exception("Failed to compile/upload PDF for user %s draft %s", user_id, draft_id)
        raise
