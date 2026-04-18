// app.js — Multimodal Manufacturing Creator

const API_BASE = "/api";   // same origin — Flask serves both frontend + backend

// ── Auth state ────────────────────────────────────────────────────────────────
let currentUser = null;

onAuthStateChanged((user) => {
  currentUser = user;
  if (user) {
    showApp();
    document.getElementById("user-name").textContent  = user.displayName || user.email || "User";
    document.getElementById("user-email").textContent = user.email || "";
    if (user.photoURL) document.getElementById("user-avatar").src = user.photoURL;
    loadHistory();
  } else {
    showAuth();
  }
});

// ── UI toggles ────────────────────────────────────────────────────────────────
function showAuth() {
  document.getElementById("auth-section").classList.remove("hidden");
  document.getElementById("app-section").classList.add("hidden");
}
function showApp() {
  document.getElementById("auth-section").classList.add("hidden");
  document.getElementById("app-section").classList.remove("hidden");
}

// ── Auth handlers ─────────────────────────────────────────────────────────────
document.getElementById("btn-google").addEventListener("click", async () => {
  try {
    showLoading("Signing in with Google...");
    await signInWithGoogle();
  } catch (err) {
    showToast("Sign-in failed: " + err.message, "error");
  } finally {
    hideLoading();
  }
});

document.getElementById("btn-logout").addEventListener("click", async () => {
  await signOut();
  showToast("Signed out", "success");
});

// ── Generation ────────────────────────────────────────────────────────────────
async function generate(mode) {
  const prompt = document.getElementById("prompt-input").value.trim();
  if (!prompt) return showToast("Please enter a manufacturing concept prompt", "warning");

  try {
    showGenerating(mode);
    clearResults();

    if (mode === "text") {
      const data = await apiPost("/generate/text", { prompt });
      renderTextResult(data.text, data.prompt);
    } else if (mode === "image") {
      const data = await apiPost("/generate/image", { prompt });
      renderImageResult(data.image_url, data.prompt);
    } else {
      const data = await apiPost("/generate/multimodal", { prompt });
      renderTextResult(data.text, data.prompt);
      renderImageResult(data.image_url, data.prompt);
    }

    document.getElementById("results-section").classList.remove("hidden");
    document.getElementById("results-section").scrollIntoView({ behavior: "smooth" });
    loadHistory();
  } catch (err) {
    showToast("Generation failed: " + err.message, "error");
  } finally {
    hideGenerating();
  }
}

// ── Search ────────────────────────────────────────────────────────────────────
document.getElementById("search-btn").addEventListener("click", searchHistory);
document.getElementById("search-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchHistory();
});

async function searchHistory() {
  const query = document.getElementById("search-input").value.trim();
  if (!query) return loadHistory();
  try {
    const data = await apiPost("/search", { query });
    renderHistory(data.results);
  } catch (err) {
    showToast("Search failed: " + err.message, "error");
  }
}

// ── History ───────────────────────────────────────────────────────────────────
async function loadHistory() {
  try {
    const data = await apiGet("/history");
    renderHistory(data.history);
  } catch (err) {
    console.error("History load error:", err);
  }
}

function renderHistory(items) {
  const container = document.getElementById("history-list");

  // ✅ Empty state (correct placement)
  if (!items || items.length === 0) {
    container.innerHTML = `<p class="empty-state">No history yet</p>`;
    return;
  }

  // ✅ Use your new component (with delete button)
  container.innerHTML = items.map(renderHistoryItem).join("");
}
function renderHistoryItem(item) {
  return `
    <div class="history-item"
        onclick="loadHistoryItem(${JSON.stringify(item).replace(/"/g, "&quot;")})">
      <div class="history-item-header">
        <div>
          <div class="history-prompt">${item.prompt}</div>
          <div class="history-date">${new Date(item.created_at).toLocaleString()}</div>
        </div>

        <button class="btn-delete" onclick="deleteOne(event, '${item.id}')">🗑️</button>
      </div>

      <div class="history-tags">
        ${item.description ? '<span class="tag tag-text">Text</span>' : ''}
        ${item.image_url ? '<span class="tag tag-image">Image</span>' : ''}
      </div>
    </div>
  `;
}

function loadHistoryItem(item) {
  document.getElementById("prompt-input").value = item.prompt;
  clearResults();
  if (item.description) renderTextResult(item.description, item.prompt);
  if (item.image_url)   renderImageResult(item.image_url, item.prompt);
  document.getElementById("results-section").classList.remove("hidden");
  document.getElementById("results-section").scrollIntoView({ behavior: "smooth" });
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderTextResult(text, prompt) {
  const el = document.getElementById("text-result");
  el.innerHTML = `
    <div class="result-header">
      <h3>📋 Manufacturing Concept Description</h3>
      <button class="btn-copy" onclick="copyText(this, \`${escapeForAttr(text)}\`)">Copy</button>
    </div>
    <div class="result-prompt-badge">Prompt: ${escapeHtml(prompt)}</div>
    <div class="result-text">${formatDescription(text)}</div>
  `;
  el.classList.remove("hidden");
}

function renderImageResult(imageUrl, prompt) {
  const el = document.getElementById("image-result");
  el.innerHTML = `
    <div class="result-header">
      <h3>🖼️ Product Prototype Visualization</h3>
      <a class="btn-download" href="${imageUrl}" download="prototype.png" target="_blank">Download</a>
    </div>
    <div class="result-prompt-badge">Prompt: ${escapeHtml(prompt)}</div>
    <div class="image-container">
      <div class="image-loading-overlay">Generating visualization…</div>
      <img src="${imageUrl}" alt="Manufacturing concept visualization"
           onload="this.classList.add('loaded'); this.previousElementSibling.style.display='none'"
           onerror="this.parentElement.innerHTML='<p class=error-msg>Image generation failed. Please retry.</p>'" />
    </div>
  `;
  el.classList.remove("hidden");
}

function formatDescription(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/^(\d+\).*)/gm, "<div class='section-title'>$1</div>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>")
    .replace(/^/, "<p>")
    .replace(/$/, "</p>");
}

function clearResults() {
  ["text-result", "image-result"].forEach(id => {
    const el = document.getElementById(id);
    el.classList.add("hidden");
    el.innerHTML = "";
  });
}

// ── API helpers ───────────────────────────────────────────────────────────────
async function authHeaders() {
  const token = await getIdToken();
  return {
    "Content-Type":  "application/json",
    "Authorization": `Bearer ${token}`,
  };
}

async function apiPost(endpoint, body) {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

async function apiGet(endpoint) {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}${endpoint}`, { headers });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

async function deleteOne(e, id) {
  e.stopPropagation(); // prevent opening item

  if (!confirm("Delete this item?")) return;
  e.target.disabled = true;

  try {
    const token = await getIdToken();

    const res = await fetch(`/api/delete/${id}`, {
      method: "DELETE",
      headers: {
        "Authorization": "Bearer " + token
      }
    });

    if (!res.ok) throw new Error("Failed");

    showToast("Deleted", "success");
    loadHistory();

  } catch (err) {
    showToast("Delete failed", "error");
    e.target.disabled = false;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btn-clear-history");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    if (!confirm("Delete ALL history? This cannot be undone.")) return;

    try {
      const token = await getIdToken();

      const res = await fetch(`/api/delete`, {
        method: "DELETE",
        headers: {
          "Authorization": "Bearer " + token
        }
      });

      if (!res.ok) throw new Error("Failed");

      showToast("All history cleared", "success");
      loadHistory();

    } catch (err) {
      showToast("Failed to clear history", "error");
    }
  });
});

// ── UI utilities ──────────────────────────────────────────────────────────────
function showLoading(msg) {
  document.getElementById("loading-overlay").classList.remove("hidden");
  document.getElementById("loading-msg").textContent = msg || "Processing…";
}
function hideLoading() {
  document.getElementById("loading-overlay").classList.add("hidden");
}

function showGenerating(mode) {
  const msgs = {
    text:       "Generating description with Llama 3…",
    image:      "Generating prototype image…",
    multimodal: "Generating full multimodal concept…",
  };
  document.getElementById("generating-bar").classList.remove("hidden");
  document.getElementById("generating-msg").textContent = msgs[mode] || "Generating…";
  ["btn-text", "btn-image", "btn-multimodal"].forEach(id => {
    document.getElementById(id).disabled = true;
  });
}
function hideGenerating() {
  document.getElementById("generating-bar").classList.add("hidden");
  ["btn-text", "btn-image", "btn-multimodal"].forEach(id => {
    document.getElementById(id).disabled = false;
  });
}

function showToast(msg, type = "info") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className   = `toast toast-${type} show`;
  setTimeout(() => t.classList.remove("show"), 3500);
}

function copyText(btn, text) {
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = "Copied!";
    setTimeout(() => (btn.textContent = "Copy"), 2000);
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function escapeForAttr(str) {
  return String(str).replace(/`/g, "\\`").replace(/\$/g, "\\$");
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// ── Example prompts ───────────────────────────────────────────────────────────
const examples = [
  "Automated robotic welding arm for automotive chassis",
  "High-precision CNC milled titanium aerospace bracket",
  "3D printed biodegradable FMCG packaging component",
  "Smart sensor-embedded conveyor belt for QC",
  "Injection molded carbon-fiber composite drone frame",
];

document.getElementById("example-prompts").innerHTML = examples
  .map(e => `<button class="example-chip" onclick="useExample('${e}')">${e}</button>`)
  .join("");

function useExample(text) {
  document.getElementById("prompt-input").value = text;
  document.getElementById("prompt-input").focus();
}
