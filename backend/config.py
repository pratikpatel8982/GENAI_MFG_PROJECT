"""config.py — loads all settings from the root .env file."""
from __future__ import annotations

import os
from pathlib import Path

def _load_dotenv(path: str = ".env"):
    p = Path(path)
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k = k.strip(); v = v.strip().strip('"').strip("'")
        if k and k not in os.environ:
            os.environ[k] = v

_load_dotenv()

class Config:
    # Groq
    GROQ_API_KEY: str = os.environ.get("GROQ_API_KEY", "")

    # Supabase
    SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.environ.get("SUPABASE_KEY", "")

    # Firebase — base64-encoded service-account JSON
    FIREBASE_CREDENTIALS_B64: str = os.environ.get("FIREBASE_CREDENTIALS_B64", "")

    # CORS
    CORS_ORIGINS: list[str] = [
        o.strip()
        for o in os.environ.get("CORS_ORIGINS", "http://localhost:5000").split(",")
        if o.strip()
    ]

    def validate(self) -> None:
        missing = [
            name
            for name, val in {
                "GROQ_API_KEY":            self.GROQ_API_KEY,
                "SUPABASE_URL":            self.SUPABASE_URL,
                "SUPABASE_KEY":            self.SUPABASE_KEY,
                "FIREBASE_CREDENTIALS_B64": self.FIREBASE_CREDENTIALS_B64,
            }.items()
            if not val
        ]
        if missing:
            raise EnvironmentError(
                f"Missing required environment variables: {', '.join(missing)}\n"
                f"Copy .env.example → .env and fill in your values."
            )


cfg = Config()
