# ⚙️ Multimodal Manufacturing Creator
**Project:** GAI-32 | Division D7 | Group 09D7

A multimodal GenAI application for manufacturing concept visualization. Combines **Groq (Llama 3)** for text generation and **Pollinations.ai** for image generation, backed by **Supabase** (vector DB) and **Firebase** (authentication).

---

## 🏗️ Project Structure

```
multimodal-manufacturing-creator/
├── backend/
│   ├── app.py                  ← Flask API server
│   ├── requirements.txt        ← Python dependencies
│   ├── .env.example            ← Environment variable template
│   └── supabase_schema.sql     ← DB schema to run in Supabase
└── static/
    ├── index.html              ← Main HTML page
    ├── css/
    │   └── style.css       ← All styles
    └── js/
        ├── firebase-config.js  ← Firebase auth setup
        └── app.js              ← Main app logic
```

---

## 🚀 Setup Guide

### Step 1 — Get Your API Keys

#### 🔑 Groq API (Free)
1. Go to https://console.groq.com
2. Sign up / log in → API Keys → Create API Key
3. Copy the key

#### 🔑 Supabase (Free)
1. Go to https://supabase.com → New Project
2. Go to **Settings → API** → copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon public key** → `SUPABASE_KEY`
3. Go to **SQL Editor** → paste and run `backend/supabase_schema.sql`

#### 🔑 Firebase (Free)
1. Go to https://console.firebase.google.com → New Project
2. Click **Web app** (</>) → register app → copy `firebaseConfig` values
3. Go to **Authentication → Sign-in method** → enable:
   - **Email/Password**
   - **Google**
4. Under **Authentication → Settings → Authorized domains**, add `localhost`

---

### Step 2 — Backend Setup

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate

# Install dependencies
pip install -r backend\requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and fill in your keys:
#   GROQ_API_KEY=...
#   SUPABASE_URL=...
#   SUPABASE_KEY=...

```

---

### Step 3 — Frontend Setup

1. Open `static/js/firebase-config.js`
2. Replace ALL placeholder values with your Firebase config:
```js
const firebaseConfig = {
  apiKey:            "YOUR_FIREBASE_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};
```

---

### Step 4 — Run

Run the application
```bash
python -m backend.app
```

 → Running on http://localhost:5000

---

## 🎯 Features

| Feature | Tech |
|---|---|
| Text generation | Groq API (Llama 3 8B) |
| Image generation | Pollinations.ai (Flux model) — **no key needed** |
| Authentication | Firebase (Email + Google OAuth) |
| Vector/history DB | Supabase (PostgreSQL) |
| Backend | Python Flask + CORS |
| Frontend | Vanilla HTML / CSS / JS |

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/generate/text` | Generate text description |
| POST | `/api/generate/image` | Generate prototype image |
| POST | `/api/generate/multimodal` | Generate both (text + image) |
| GET  | `/api/history?uid=...` | Fetch user's concept history |
| POST | `/api/search` | Search past concepts |
| POST | `/api/delete` | Clear History |
| POST | `/api/delete/<concept-id>` | Delete Single Entry |
| GET  | `/api/health` | Health check |

---

## 🛠️ Tools Used

- **Python** · Flask · Groq SDK · Supabase Python client
- **JavaScript** · Firebase Auth SDK
- **Pollinations.ai** — free, no-key image generation
- **Supabase** — free-tier PostgreSQL with REST API
- **Firebase** — free-tier authentication

---

## ⚠️ Notes

- Pollinations.ai image generation can take 10–30 seconds on first load
- Groq free tier allows ~30 requests/minute on Llama 3 8B
- Supabase free tier allows 500 MB DB + 2 GB bandwidth/month
- Firebase free tier (Spark) supports up to 10,000 auth users/month
