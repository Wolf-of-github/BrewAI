import os
from flask import Flask

SERVICE_VERSION = os.environ.get("SERVICE_VERSION", "unknown")
print(f"[startup] github-reader-service version={SERVICE_VERSION}", flush=True)

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")
GEMINI_API_KEY = os.environ.get("gemini_api_key")
GCS_BUCKET_NAME = os.environ.get("GCS_BUCKET_NAME")

if not GITHUB_TOKEN:
    raise RuntimeError("GITHUB_TOKEN environment variable is required")
if not GEMINI_API_KEY:
    raise RuntimeError("gemini_api_key environment variable is required")
if not GCS_BUCKET_NAME:
    raise RuntimeError("GCS_BUCKET_NAME environment variable is required")

from routes import bp, set_token
set_token(GITHUB_TOKEN)

app = Flask(__name__)
app.register_blueprint(bp)

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
