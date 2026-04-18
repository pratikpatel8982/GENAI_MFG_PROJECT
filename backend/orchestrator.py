"""orchestrator.py — wraps Groq + Pollinations + Supabase into one service object."""
from __future__ import annotations

import base64
import json
import uuid
from datetime import datetime, timezone

import requests
from groq import Groq
from supabase import Client, create_client

from backend.config import cfg

_SYSTEM_PROMPT = (
    "You are an expert manufacturing engineer and product designer. "
    "When given a manufacturing concept or product idea, provide a comprehensive, "
    "structured description covering:\n"
    "1) Overview & Purpose\n"
    "2) Key Components & Materials\n"
    "3) Manufacturing Process\n"
    "4) Quality Standards\n"
    "5) Applications & Use Cases\n"
    "6) Innovation Highlights\n"
    "Be technical, precise, and professional."
)

_IMAGE_PREFIX = (
    "professional product prototype visualization, manufacturing concept, "
    "industrial design, high-fidelity rendering, technical blueprint style, "
    "clean white background, photorealistic: "
)

POLLINATIONS_BASE = "https://image.pollinations.ai/prompt/"


class ManufacturingOrchestrator:
    """Initialised once at app startup; holds all external service clients."""

    def __init__(self) -> None:
        cfg.validate()
        self._groq = Groq(api_key=cfg.GROQ_API_KEY)
        self._db: Client = create_client(cfg.SUPABASE_URL, cfg.SUPABASE_KEY)

    # ── Text ─────────────────────────────────────────────────────────────────

    def generate_text(self, prompt: str) -> str:
        chat = self._groq.chat.completions.create(
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user",   "content": f"Create a detailed manufacturing concept description for: {prompt}"},
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.7,
            max_tokens=1024,
        )
        return chat.choices[0].message.content

    # ── Image ────────────────────────────────────────────────────────────────

    def generate_image_url(self, prompt: str) -> str:
        enhanced = _IMAGE_PREFIX + prompt
        encoded = requests.utils.quote(enhanced)

        url = f"{POLLINATIONS_BASE}{encoded}"
        params = {
            "width": 800,
            "height": 600,
            "seed": 42,
            "model": "flux",
        }

        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; ImageTest/1.0)",
            "Accept": "image/png,image/jpeg,*/*",
        }

        try:
            resp = requests.get(url, params=params, headers=headers, timeout=20)

            if resp.status_code == 200:
                # return final resolved URL (important)
                return resp.url

            print(f"[Pollinations] Failed: {resp.status_code} - {resp.text}")

        except requests.RequestException as e:
            print(f"[Pollinations] Exception: {e}")

        # fallback (no seed, simpler)
        fallback_url = f"{POLLINATIONS_BASE}{encoded}?width=800&height=600"
        return fallback_url

    # ── Supabase ─────────────────────────────────────────────────────────────

    def save_concept(
        self,
        uid: str,
        prompt: str,
        *,
        description: str | None = None,
        image_url: str | None = None,
    ) -> None:
        try:
            self._db.table("manufacturing_concepts").insert(
                {
                    "id":          str(uuid.uuid4()),
                    "uid":         uid,
                    "prompt":      prompt,
                    "description": description,
                    "image_url":   image_url,
                    "created_at":  datetime.now(timezone.utc).isoformat(),
                }
            ).execute()
        except Exception as exc:
            # Non-fatal — log and continue
            print(f"[Supabase] insert error: {exc}")

    def get_history(self, uid: str, limit: int = 20) -> list[dict]:
        result = (
            self._db.table("manufacturing_concepts")
            .select("*")
            .eq("uid", uid)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []

    def search_concepts(self, uid: str, query: str) -> list[dict]:
        result = self._db.rpc(
            "search_concepts",
            {"query": query, "user_id": uid}
        ).execute()
        return result.data or []

    def delete_all(self, uid: str) -> None:
        self._db.table("manufacturing_concepts") \
            .delete() \
            .eq("uid", uid) \
            .execute()


    def delete_one(self, uid: str, concept_id: str) -> None:
        self._db.table("manufacturing_concepts") \
            .delete() \
            .eq("uid", uid) \
            .eq("id", concept_id) \
            .execute()

    # ── Firebase token verification ──────────────────────────────────────────

    @staticmethod
    def verify_firebase_token(id_token: str) -> dict:
        """
        Verify a Firebase ID token using the Firebase Admin SDK.
        Returns the decoded token claims (includes 'uid', 'email', etc.).
        Raises ValueError on failure.
        """
        import firebase_admin
        from firebase_admin import auth as fb_auth, credentials as fb_creds

        # Initialise once
        if not firebase_admin._apps:
            raw_json = base64.b64decode(cfg.FIREBASE_CREDENTIALS_B64).decode()
            cred = fb_creds.Certificate(json.loads(raw_json))
            firebase_admin.initialize_app(cred)

        try:
            return fb_auth.verify_id_token(id_token)
        except Exception as exc:
            raise ValueError(f"Invalid Firebase token: {exc}") from exc
