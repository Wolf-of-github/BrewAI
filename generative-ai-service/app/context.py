import logging
import os

from langchain_community.chat_message_histories import RedisChatMessageHistory

logger = logging.getLogger(__name__)

_REDIS_URL = f"redis://{os.environ.get('REDIS_HOST', 'localhost')}:{os.environ.get('REDIS_PORT', 6379)}"
_TTL = 3600  # 1 hour


def get_history(session_id: str) -> RedisChatMessageHistory:
    """Return the RedisChatMessageHistory for this session."""
    return RedisChatMessageHistory(
        session_id=f"context:{session_id}",
        url=_REDIS_URL,
        ttl=_TTL,
    )


def fetch_context(session_id: str) -> list:
    """
    Fetch chat history messages for a session from Redis.
    Returns an empty list if no context exists yet (first request).
    """
    try:
        history = get_history(session_id)
        messages = history.messages
        logger.info("Fetched %d context messages for session %s", len(messages), session_id)
        return messages
    except Exception:
        logger.warning("Could not fetch context for session %s — treating as fresh", session_id)
        return []


def get_cached_projects(context_messages: list) -> list[str] | None:
    """
    Extract previously selected projects from context messages.
    Returns the list if found, None if context is empty or projects not stored.
    """
    for msg in reversed(context_messages):
        content = getattr(msg, "content", "")
        if "Projects used:" in content:
            raw = content.split("Projects used:")[-1].strip()
            if raw and raw != "none":
                return [p.strip() for p in raw.split(",") if p.strip()]
    return None


def update_context(session_id: str, user_prompt: str | None, jd: str, selected_projects: list[str]) -> None:
    """
    Append a summary of this generation run to the Redis session history.
    Keeps context lightweight — stores the user instruction and what was selected.
    TTL is reset on every write (10 minutes from last activity).
    """
    try:
        history = get_history(session_id)
        human_msg = user_prompt or "No specific instruction."
        ai_msg = f"Generated resume targeting: {jd[:120]}... | Projects used: {', '.join(selected_projects) if selected_projects else 'none'}"
        history.add_user_message(human_msg)
        history.add_ai_message(ai_msg)
        logger.info("Context written for session %s | human: %s | ai: %s", session_id, human_msg[:80], ai_msg[:80])
    except Exception:
        logger.warning("Could not update context for session %s", session_id)
