import json
import logging
from pathlib import Path

from langchain_core.messages import BaseMessage
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI

from .secrets import get_gemini_api_key

logger = logging.getLogger(__name__)

_PROMPTS_DIR = Path(__file__).parent / "prompts"
_TEMPLATE_PATH = Path(__file__).parent / "resume-template.tex"


def _load(name: str) -> str:
    return (_PROMPTS_DIR / name).read_text()


def _load_template() -> str:
    try:
        return _TEMPLATE_PATH.read_text()
    except Exception:
        logger.warning("Could not load resume-template.tex from %s", _TEMPLATE_PATH)
        return ""


_llm: ChatGoogleGenerativeAI | None = None


def _get_llm() -> ChatGoogleGenerativeAI:
    global _llm
    if _llm is None:
        _llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=get_gemini_api_key(),
            temperature=0.2,
            request_timeout=120,
        )
    return _llm


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _format_project_summaries(github_projects: dict) -> str:
    return "\n".join(
        f"- {name}: {info.get('summary', 'No summary available.')}"
        for name, info in github_projects.items()
    )


def _format_links(resume: dict) -> str:
    links = resume.get("links", [])
    if not links:
        return "No hyperlinks available."
    parts = []
    for l in links:
        if isinstance(l, dict):
            url = l.get("url", "")
            text = l.get("text", "")
            parts.append(f"- {text}: {url}" if text else f"- {url}")
        else:
            parts.append(f"- {l}")
    return "\n".join(parts)


def _format_readmes(readmes: dict) -> str:
    if not readmes:
        return "No README content available."
    parts = []
    for name, text in readmes.items():
        parts.append(f"=== {name} ===\n{text[:3000]}")  # cap per readme to avoid token overflow
    return "\n\n".join(parts)


def _format_context(messages: list[BaseMessage]) -> str:
    if not messages:
        return "No prior context."
    return "\n".join(f"{m.__class__.__name__}: {m.content}" for m in messages)


# ─── Prompt templates (loaded once at import, no secrets needed) ──────────────

_SAFETY_SYSTEM   = _load("safety_system.txt")
_SAFETY_HUMAN    = _load("safety_human.txt")
_METADATA_SYSTEM = _load("metadata_system.txt")
_METADATA_HUMAN  = _load("metadata_human.txt")
_INTENT_SYSTEM   = _load("intent_system.txt")
_INTENT_HUMAN    = _load("intent_human.txt")
_SELECTION_SYSTEM = _load("selection_system.txt")
_SELECTION_HUMAN  = _load("selection_human.txt")
_TEX_EDIT_SYSTEM = _load("tex_edit_system.txt")
_TEX_EDIT_HUMAN  = _load("tex_edit_human.txt")
_GENERATION_LATEX_SYSTEM = _load("generation_latex_system.txt")  # fallback only
_GENERATION_LATEX_HUMAN  = _load("generation_latex_human.txt")


_GCS_BUCKET = "brewai-497502-artifacts"


def _fetch_from_gcs(blob_name: str, fallback: str) -> str:
    """Fetch a file from GCS, falling back to the provided string on any error."""
    try:
        from google.cloud import storage
        blob = storage.Client().bucket(_GCS_BUCKET).blob(blob_name)
        return blob.download_as_text()
    except Exception:
        logger.warning("GCS fetch failed for %s — using bundled fallback", blob_name)
        return fallback


_LATEX_TEMPLATE_FALLBACK = _load_template()


# ─── Safety Check ────────────────────────────────────────────────────────────

def check_inputs(jd: str, user_prompt: str | None) -> bool:
    """
    Safety check — passes JD and user prompt through Gemini to detect prompt injection.
    Returns True if inputs are safe, False if malicious or on any failure.
    """
    try:
        chain = (
            ChatPromptTemplate.from_messages([("system", _SAFETY_SYSTEM), ("human", _SAFETY_HUMAN)])
            | _get_llm()
            | JsonOutputParser()
        )
        result = chain.invoke({
            "jd": jd,
            "user_prompt": user_prompt or "No user instruction provided.",
        })
        safe = result.get("safe", False)
        logger.info("Safety check result: %s", safe)
        return bool(safe)
    except Exception:
        logger.exception("Safety check call failed — blocking request")
        return False


# ─── Job Metadata Extraction ─────────────────────────────────────────────────

def extract_job_metadata(jd: str) -> tuple[str, str]:
    """
    Extract company name and job role from a job description.
    Returns (company, role), falling back to generic values on failure.
    """
    try:
        chain = (
            ChatPromptTemplate.from_messages([("system", _METADATA_SYSTEM), ("human", _METADATA_HUMAN)])
            | _get_llm()
            | JsonOutputParser()
        )
        result = chain.invoke({"jd": jd[:5000]})
        company = result.get("company") or "Company"
        role = result.get("role") or "Role"
        logger.info("Extracted metadata — company: %s, role: %s", company, role)
        return company, role
    except Exception:
        logger.exception("Metadata extraction failed — using defaults")
        return "Company", "Role"


# ─── Call 1a: Intent Detection ───────────────────────────────────────────────

def detect_intent(user_prompt: str) -> str:
    """
    Call 1a — Classify user intent as "tweak", "projects", or "revamp".
    Falls back to "tweak" on failure.
    """
    try:
        chain = (
            ChatPromptTemplate.from_messages([("system", _INTENT_SYSTEM), ("human", _INTENT_HUMAN)])
            | _get_llm()
            | JsonOutputParser()
        )
        result = chain.invoke({"user_prompt": user_prompt})
        intent = result.get("intent", "tweak")
        if intent not in ("tweak", "projects", "revamp"):
            return "tweak"
        logger.info("Detected intent: %s", intent)
        return intent
    except Exception:
        logger.exception("Intent detection failed — defaulting to tweak")
        return "tweak"


# ─── Call 1b: Project Selection ───────────────────────────────────────────────

def select_projects(
    jd: str,
    user_prompt: str | None,
    github_projects: dict,
    context_messages: list[BaseMessage],
) -> list[str]:
    """
    Call 1b — Use Gemini to select which GitHub projects to include in the resume.
    Falls back to the first 3 projects (alphabetically) if Gemini fails.
    """
    if not github_projects:
        logger.info("No github_projects available — skipping project selection")
        return []

    fallback = sorted(github_projects.keys())[:3]

    try:
        chain = (
            ChatPromptTemplate.from_messages([("system", _SELECTION_SYSTEM), ("human", _SELECTION_HUMAN)])
            | _get_llm()
            | JsonOutputParser()
        )
        result = chain.invoke({
            "jd": jd,
            "user_prompt": user_prompt or "No specific instruction.",
            "project_summaries": _format_project_summaries(github_projects),
            "context": _format_context(context_messages),
        })

        selected = result.get("selected_projects", [])
        valid = [p for p in selected if p in github_projects]

        if not valid:
            logger.warning("Gemini returned no valid project names — using fallback")
            return fallback

        logger.info("Selected projects: %s", valid)
        return valid

    except Exception:
        logger.exception("Project selection call failed — using fallback")
        return fallback


# ─── Call 1c: LaTeX Edit ──────────────────────────────────────────────────────

def edit_resume_tex(
    tex: str,
    user_prompt: str,
    jd: str,
    readmes: dict | None = None,
    context_messages: list[BaseMessage] | None = None,
) -> str:
    """
    Call 1c — Use Gemini to apply a surgical edit to an existing resume .tex source.
    Accepts optional readmes (for project changes) and context.
    Returns the modified .tex string. Falls back to original .tex on failure.
    """
    try:
        chain = (
            ChatPromptTemplate.from_messages([("system", _TEX_EDIT_SYSTEM), ("human", _TEX_EDIT_HUMAN)])
            | _get_llm()
        )
        result = chain.invoke({
            "user_prompt": user_prompt,
            "jd": jd,
            "readmes": _format_readmes(readmes or {}),
            "context": _format_context(context_messages or []),
            "tex": tex,
        })
        edited = result.content.strip()
        if edited.startswith("```"):
            edited = edited.split("\n", 1)[-1]
            edited = edited.rsplit("```", 1)[0].strip()
        logger.info("LaTeX edit applied successfully")
        return edited
    except Exception:
        logger.exception("LaTeX edit call failed — returning original .tex")
        return tex


# ─── Call 2 (LaTeX): Resume Generation ───────────────────────────────────────

def generate_resume_latex(
    resume: dict,
    jd: str,
    readmes: dict,
    rendered_tex: str | None,
    user_prompt: str | None,
    context_messages: list[BaseMessage],
    one_page: bool = False,
) -> str:
    """
    Call 2 (LaTeX) — Single Gemini call that generates a complete ready-to-compile
    .tex resume. Returns the .tex string. Falls back to empty string on failure.
    """
    try:
        system_prompt = _fetch_from_gcs("prompts/generation_latex_system.txt", _GENERATION_LATEX_SYSTEM)
        latex_template = _fetch_from_gcs("prompts/resume-template.tex", _LATEX_TEMPLATE_FALLBACK)
        chain = (
            ChatPromptTemplate.from_messages([("system", system_prompt), ("human", _GENERATION_LATEX_HUMAN)])
            | _get_llm()
        )
        result = chain.invoke({
            "resume": json.dumps(resume, indent=2),
            "jd": jd,
            "readmes": _format_readmes(readmes),
            "rendered_tex": rendered_tex or "None",
            "user_prompt": user_prompt or "No specific instruction.",
            "context": _format_context(context_messages),
            "template": latex_template,
            "links": _format_links(resume),
            "one_page": "true" if one_page else "false",
        })
        tex = result.content.strip()
        if tex.startswith("```"):
            tex = tex.split("\n", 1)[-1]
            tex = tex.rsplit("```", 1)[0].strip()
        logger.info("LaTeX resume generation complete")
        return tex

    except Exception:
        logger.exception("LaTeX resume generation call failed")
        return ""
