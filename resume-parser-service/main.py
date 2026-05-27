import os
from flask import Flask, request, jsonify

from parser import parse_resume

GEMINI_API_KEY = os.environ.get("gemini_api_key")
PORT = int(os.environ.get("PORT", 8080))

if not GEMINI_API_KEY:
    raise RuntimeError("gemini_api_key environment variable is required")

app = Flask(__name__)

REQUIRED_FIELDS = {"fileId", "userId", "gcsPath"}


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"}), 200


@app.route("/parse", methods=["POST"])
def parse():
    body = request.get_json(silent=True) or {}

    missing = REQUIRED_FIELDS - body.keys()
    if missing:
        return jsonify({"error": f"Missing required fields: {missing}"}), 400

    file_id = body["fileId"]
    user_id = body["userId"]
    print(f"[parse] Received fileId={file_id} userId={user_id}", flush=True)

    try:
        parse_resume(body)
    except ValueError as e:
        print(f"[parse] Unrecoverable error fileId={file_id} — {e}", flush=True)
        return jsonify({"error": str(e)}), 422
    except Exception as e:
        print(f"[parse] Internal error fileId={file_id} — {e}", flush=True)
        return jsonify({"error": "Internal server error"}), 500

    return jsonify({"ack": True, "fileId": file_id}), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT)
