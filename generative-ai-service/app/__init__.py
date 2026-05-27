import os

from flask import Flask

_REQUIRED_ENV_VARS = [
    "GCP_PROJECT",
    "GCS_BUCKET",
    "REDIS_HOST",
    "REDIS_PORT",
]

_missing = [v for v in _REQUIRED_ENV_VARS if not os.environ.get(v)]
if _missing:
    raise EnvironmentError(f"Missing required environment variables: {', '.join(_missing)}")

from .routes import bp


def create_app():
    app = Flask(__name__)
    app.register_blueprint(bp)
    return app
