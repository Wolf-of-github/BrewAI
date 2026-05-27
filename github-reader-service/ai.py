import os
from pathlib import Path

from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI

_PROMPTS_DIR = Path(__file__).parent / "prompts"


def _load(name: str) -> str:
    return (_PROMPTS_DIR / name).read_text()


_llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    google_api_key=os.environ.get("gemini_api_key"),
    temperature=0.2,
    request_timeout=30,
)

# ─── Project Selection ────────────────────────────────────────────────────────

_SELECT_SYSTEM = _load("select_system.txt")
_SELECT_HUMAN = _load("select_human.txt")

_select_chain = (
    ChatPromptTemplate.from_messages([
        ("system", _SELECT_SYSTEM),
        ("human", _SELECT_HUMAN),
    ])
    | _llm
    | JsonOutputParser()
)


def select_projects(repos: list[dict]) -> list[str]:
    """
    Given a list of { name, description } dicts, ask Gemini to pick
    the meaningful ones. Returns list of selected repo names.
    Falls back to all repo names on failure.
    """
    all_names = [r["name"] for r in repos]
    repo_list = "\n".join(
        f"- {r['name']}: {r['description'] or 'No description'}"
        for r in repos
    )
    try:
        result = _select_chain.invoke({"repo_list": repo_list})
        selected = result.get("selected", [])
        # Only keep names that actually exist in our list
        valid = [name for name in selected if name in all_names]
        print(f"[ai] Project selection: {len(valid)}/{len(repos)} selected", flush=True)
        return valid if valid else all_names
    except Exception as e:
        print(f"[ai] Project selection failed — using all repos: {e}", flush=True)
        return all_names


# ─── README Summarisation ─────────────────────────────────────────────────────

_SUMMARISE_SYSTEM = _load("summarise_system.txt")
_SUMMARISE_HUMAN = _load("summarise_human.txt")

_summarise_chain = (
    ChatPromptTemplate.from_messages([
        ("system", _SUMMARISE_SYSTEM),
        ("human", _SUMMARISE_HUMAN),
    ])
    | _llm
    | JsonOutputParser()
)


def summarise_readme(repo_name: str, readme_text: str) -> str:
    """
    Summarise a GitHub README using Gemini.
    Returns the summary string, or empty string on failure.
    """
    try:
        result = _summarise_chain.invoke({
            "repo_name": repo_name,
            "readme_text": readme_text[:8000],  # cap to avoid token overflow
        })
        summary = result.get("summary", "")
        print(f"[ai] Summarised repo={repo_name} length={len(summary)}", flush=True)
        return summary
    except Exception as e:
        print(f"[ai] Summarisation failed repo={repo_name} — {e}", flush=True)
        return ""
