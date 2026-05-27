import os
import logging
from google.cloud import secretmanager

logger = logging.getLogger(__name__)

_client = secretmanager.SecretManagerServiceClient()
_cache: dict[str, str] = {}

_PROJECT_ID = os.environ.get("GCP_PROJECT")


def get_secret(name: str) -> str:
    if name in _cache:
        return _cache[name]

    path = f"projects/{_PROJECT_ID}/secrets/{name}/versions/latest"
    response = _client.access_secret_version(name=path)
    value = response.payload.data.decode("utf-8")
    _cache[name] = value
    logger.info("Loaded secret: %s", name)
    return value


def get_gemini_api_key() -> str:
    return get_secret("gemini_api_key")


def get_github_token() -> str:
    return get_secret("github_token")
