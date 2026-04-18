"""app.py — Flask application factory for the Multimodal Manufacturing Creator."""
from __future__ import annotations

from functools import wraps
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from backend.config import cfg
from backend.orchestrator import ManufacturingOrchestrator

# Root of the repo (one level above /backend)
_ROOT = Path(__file__).resolve().parent.parent


# ── Auth decorator ────────────────────────────────────────────────────────────

def require_auth(orchestrator: ManufacturingOrchestrator):
    """Decorator that verifies a Firebase ID-token in the Authorization header."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            auth_header = request.headers.get("Authorization", "")
            if not auth_header.startswith("Bearer "):
                return jsonify({"error": "Missing or invalid Authorization header"}), 401
            id_token = auth_header.split(" ", 1)[1]
            try:
                decoded = orchestrator.verify_firebase_token(id_token)
                request.uid = decoded["uid"]   # attach uid to request context
            except ValueError as exc:
                return jsonify({"error": str(exc)}), 401
            return fn(*args, **kwargs)
        return wrapper
    return decorator


# ── App factory ───────────────────────────────────────────────────────────────

def create_app() -> Flask:
    app = Flask(
        __name__,
        static_folder=str(_ROOT / "static"),   # → <root>/static
        static_url_path="",
    )
    CORS(app, origins=cfg.CORS_ORIGINS, supports_credentials=True)

    orchestrator = ManufacturingOrchestrator()
    auth_required = require_auth(orchestrator)

    # ── Static / Frontend ─────────────────────────────────────────────────────

    @app.route("/")
    def index():
        """Serve the frontend SPA."""
        return send_from_directory(str(_ROOT / "static"), "index.html")

    @app.route("/static/<path:filename>")
    def frontend_files(filename: str):
        return send_from_directory(str(_ROOT / "static"), filename)

    # ── Health ────────────────────────────────────────────────────────────────

    @app.route("/api/health")
    def health():
        return jsonify({"status": "ok", "message": "Multimodal Manufacturing Creator running"})

    # ── Text Generation ───────────────────────────────────────────────────────

    @app.route("/api/generate/text", methods=["POST"])
    @auth_required
    def generate_text():
        data   = request.get_json(silent=True) or {}
        prompt = (data.get("prompt") or "").strip()
        if not prompt:
            return jsonify({"error": "prompt is required"}), 400

        text = orchestrator.generate_text(prompt)
        orchestrator.save_concept(request.uid, prompt, description=text)
        return jsonify({"text": text, "prompt": prompt})

    # ── Image Generation ──────────────────────────────────────────────────────

    @app.route("/api/generate/image", methods=["POST"])
    @auth_required
    def generate_image():
        data   = request.get_json(silent=True) or {}
        prompt = (data.get("prompt") or "").strip()
        if not prompt:
            return jsonify({"error": "prompt is required"}), 400

        image_url = orchestrator.generate_image_url(prompt)
        orchestrator.save_concept(request.uid, prompt, image_url=image_url)
        return jsonify({"image_url": image_url, "prompt": prompt})

    # ── Multimodal ────────────────────────────────────────────────────────────

    @app.route("/api/generate/multimodal", methods=["POST"])
    @auth_required
    def generate_multimodal():
        data   = request.get_json(silent=True) or {}
        prompt = (data.get("prompt") or "").strip()
        if not prompt:
            return jsonify({"error": "prompt is required"}), 400

        text      = orchestrator.generate_text(prompt)
        image_url = orchestrator.generate_image_url(prompt)
        orchestrator.save_concept(request.uid, prompt, description=text, image_url=image_url)
        return jsonify({"text": text, "image_url": image_url, "prompt": prompt})

    # ── History ───────────────────────────────────────────────────────────────

    @app.route("/api/history")
    @auth_required
    def get_history():
        history = orchestrator.get_history(request.uid)
        return jsonify({"history": history})

    # ── Search ────────────────────────────────────────────────────────────────

    @app.route("/api/search", methods=["POST"])
    @auth_required
    def search_concepts():
        data  = request.get_json(silent=True) or {}
        query = (data.get("query") or "").strip()
        if not query:
            return jsonify({"error": "query is required"}), 400

        results = orchestrator.search_concepts(request.uid, query)
        return jsonify({"results": results})

    # ── Delete all ─────────────────────────────────────────────────────────────

    @app.route("/api/delete", methods=["DELETE"])
    @auth_required
    def delete_all_history():
        try:
            orchestrator.delete_all(request.uid)
            return jsonify({"status": "success", "message": "All history deleted"})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    # ── Delete one ─────────────────────────────────────────────────────────────

    @app.route("/api/delete/<concept_id>", methods=["DELETE"])
    @auth_required
    def delete_one(concept_id):
        try:
            orchestrator.delete_one(request.uid, concept_id)
            return jsonify({"status": "success", "message": "Deleted"})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    return app

# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    application = create_app()
    application.run(debug=True, host="0.0.0.0", port=5000)
