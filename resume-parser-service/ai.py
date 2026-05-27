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
    temperature=0.0,
    request_timeout=30,
)

_SAFETY_SYSTEM = _load("safety_system.txt")
_SAFETY_HUMAN = _load("safety_human.txt")

_safety_chain = (
    ChatPromptTemplate.from_messages([
        ("system", _SAFETY_SYSTEM),
        ("human", _SAFETY_HUMAN),
    ])
    | _llm
    | JsonOutputParser()
)


def check_resume_text(text: str) -> bool:
    """
    Safety check — passes extracted resume text through Gemini to detect prompt injection.
    Returns True if safe, False if malicious or on any failure (fail closed).
    """
    try:
        result = _safety_chain.invoke({"resume_text": text})
        safe = result.get("safe", False)
        print(f"[ai] Safety check result: safe={safe}", flush=True)
        return bool(safe)
    except Exception as e:
        print(f"[ai] Safety check call failed — blocking: {e}", flush=True)
        return False
