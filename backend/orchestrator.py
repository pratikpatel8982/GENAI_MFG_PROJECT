"""orchestrator.py — Agentic version with planning + tool execution"""

from __future__ import annotations

import base64
import json
import uuid
from datetime import datetime, timezone

import requests
from groq import Groq
from supabase import Client, create_client

from backend.config import cfg


# ─────────────────────────────────────────────────────────────────────────────
# SYSTEM PROMPTS
# ─────────────────────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = (
    "You are an expert manufacturing engineer and product designer.\n"
    "Provide structured outputs with:\n"
    "1) Overview\n2) Components\n3) Process\n4) Materials\n"
    "5) Applications\n6) Innovations\n"
)

_PLANNER_PROMPT = """
You are an AI planning agent.

Decide which tools to use for the user request.

Available tools:
- text → generate technical description
- image → generate product visualization

Rules:
- If user asks to explain → use text
- If user asks to visualize/design → use image
- If unclear → use BOTH

Return ONLY JSON:
[
  {"tool": "text"},
  {"tool": "image"}
]
"""

_IMAGE_PREFIX = (
    "professional product prototype visualization, manufacturing concept, "
    "industrial design, photorealistic, clean white background: "
)

POLLINATIONS_BASE = "https://image.pollinations.ai/prompt/"


# ─────────────────────────────────────────────────────────────────────────────
# AGENTIC ORCHESTRATOR
# ─────────────────────────────────────────────────────────────────────────────

class ManufacturingOrchestrator:
    def __init__(self) -> None:
        cfg.validate()
        self._groq = Groq(api_key=cfg.GROQ_API_KEY)
        self._db: Client = create_client(cfg.SUPABASE_URL, cfg.SUPABASE_KEY)

    # ─────────────────────────────────────────────────────────────────────────
    # 🧠 AGENT: PLAN
    # ─────────────────────────────────────────────────────────────────────────

    def _plan(self, prompt: str) -> list[dict]:
        """Use LLM to decide which tools to call"""
        try:
            chat = self._groq.chat.completions.create(
                messages=[
                    {"role": "system", "content": _PLANNER_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                model="llama-3.3-70b-versatile",
                temperature=0.2,
                max_tokens=200,
            )

            content = chat.choices[0].message.content.strip()

            # Try parsing JSON
            plan = json.loads(content)
            return plan

        except Exception:
            # fallback → use both
            return [{"tool": "text"}, {"tool": "image"}]

    # ─────────────────────────────────────────────────────────────────────────
    # 🛠️ TOOLS
    # ─────────────────────────────────────────────────────────────────────────

    def _tool_generate_text(self, prompt: str) -> str:
        chat = self._groq.chat.completions.create(
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": f"Create manufacturing concept: {prompt}"},
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.7,
            max_tokens=1024,
        )
        return chat.choices[0].message.content

    def _tool_generate_image(self, prompt: str) -> str:
        enhanced = _IMAGE_PREFIX + prompt
        encoded = requests.utils.quote(enhanced)

        url = f"{POLLINATIONS_BASE}{encoded}"

        try:
            resp = requests.get(url, timeout=20)
            if resp.status_code == 200:
                return resp.url
        except Exception:
            pass

        return url

    # ─────────────────────────────────────────────────────────────────────────
    # 🤖 AGENT EXECUTION
    # ─────────────────────────────────────────────────────────────────────────

    def run_agent(self, prompt: str) -> dict:
        """Main agent loop"""

        plan = self._plan(prompt)

        result = {
            "text": None,
            "image_url": None,
        }

        for step in plan:
            tool = step.get("tool")

            if tool == "text":
                result["text"] = self._tool_generate_text(prompt)

            elif tool == "image":
                result["image_url"] = self._tool_generate_image(prompt)

        return result

    # ─────────────────────────────────────────────────────────────────────────
    # 🔁 PUBLIC METHODS (KEEP SAME API)
    # ─────────────────────────────────────────────────────────────────────────

    def generate_text(self, prompt: str) -> str:
        return self.run_agent(prompt)["text"]

    def generate_image_url(self, prompt: str) -> str:
        return self.run_agent(prompt)["image_url"]

    # ─────────────────────────────────────────────────────────────────────────
    # 💾 DATABASE (UNCHANGED)
    # ─────────────────────────────────────────────────────────────────────────

    def save_concept(self, uid: str, prompt: str, *, description=None, image_url=None):
        try:
            self._db.table("manufacturing_concepts").insert(
                {
                    "id": str(uuid.uuid4()),
                    "uid": uid,
                    "prompt": prompt,
                    "description": description,
                    "image_url": image_url,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
            ).execute()
        except Exception as exc:
            print(f"[Supabase] insert error: {exc}")

    def get_history(self, uid: str, limit: int = 20):
        result = (
            self._db.table("manufacturing_concepts")
            .select("*")
            .eq("uid", uid)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []

    def search_concepts(self, uid: str, query: str):
        result = self._db.rpc(
            "search_concepts",
            {"query": query, "user_id": uid}
        ).execute()
        return result.data or []

    def delete_all(self, uid: str):
        self._db.table("manufacturing_concepts") \
            .delete() \
            .eq("uid", uid) \
            .execute()

    def delete_one(self, uid: str, concept_id: str):
        self._db.table("manufacturing_concepts") \
            .delete() \
            .eq("uid", uid) \
            .eq("id", concept_id) \
            .execute()

    # ─────────────────────────────────────────────────────────────────────────
    # 🔐 AUTH (UNCHANGED)
    # ─────────────────────────────────────────────────────────────────────────

    @staticmethod
    def verify_firebase_token(id_token: str) -> dict:
        import firebase_admin
        from firebase_admin import auth as fb_auth, credentials as fb_creds

        if not firebase_admin._apps:
            raw_json = base64.b64decode(cfg.FIREBASE_CREDENTIALS_B64).decode()
            cred = fb_creds.Certificate(json.loads(raw_json))
            firebase_admin.initialize_app(cred)

        try:
            return fb_auth.verify_id_token(id_token)
        except Exception as exc:
            raise ValueError(f"Invalid Firebase token: {exc}") from exc
