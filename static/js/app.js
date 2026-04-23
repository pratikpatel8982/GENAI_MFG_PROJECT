// app.js — Multimodal Manufacturing Agent
// Drop-in replacement for /static/js/app.js
// Same API contract: /api/generate/multimodal, /api/history, /api/search, /api/delete[/id]

const API_BASE = "/api";

// ── State ────────────────────────────────────────────────────
let currentUser = null;
let isGenerating = false;
let lastPrompt = "";

// ── Auth lifecycle ──────────────────────────────────────────
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

function showAuth() {
  document.getElementById("auth-section").classList.remove("hidden");
  document.getElementById("app-section").classList.add("hidden");
}
function showApp() {
  document.getElementById("auth-section").classList.add("hidden");
  document.getElementById("app-section").classList.remove("hidden");
}

// ── Auth handlers ───────────────────────────────────────────
document.getElementById("btn-google").addEventListener("click", async () => {
  try {
    showLoading("Signing in with Google…");
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

// ── Prompt input UX ─────────────────────────────────────────
const promptInput = document.getElementById("prompt-input");
const charCount = document.getElementById("char-count");

promptInput.addEventListener("input", () => {
  charCount.textContent = promptInput.value.length;
});

promptInput.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    generate();
  }
});

// ── Example prompts ─────────────────────────────────────────
const examples = [
  "Automated robotic welding arm for automotive chassis",
  "High-precision CNC milled titanium aerospace bracket",
  "3D printed biodegradable FMCG packaging component",
  "Smart sensor-embedded conveyor belt for QC",
  "Injection molded carbon-fiber composite drone frame",
];

document.getElementById("example-prompts").innerHTML = examples
  .map((e) => `<button class="example-chip" data-prompt="${escapeAttr(e)}">${escapeHtml(e)}</button>`)
  .join("");

document.getElementById("example-prompts").addEventListener("click", (e) => {
  const btn = e.target.closest(".example-chip");
  if (!btn) return;
  promptInput.value = btn.dataset.prompt;
  charCount.textContent = promptInput.value.length;
  promptInput.focus();
});

// ── Generation (with agent reasoning panel) ─────────────────
document.getElementById("btn-generate").addEventListener("click", generate);
document.getElementById("btn-retry").addEventListener("click", () => {
  hideAgentError();
  generate();
});

async function generate() {
  if (isGenerating) return;
  const prompt = promptInput.value.trim();
  if (!prompt) {
    showToast("Enter a prompt first", "warning");
    promptInput.focus();
    return;
  }

  isGenerating = true;
  lastPrompt = prompt;
  setGenerateDisabled(true);
  hideResults();
  hideAgentError();
  resetAgentPanel();
  showAgentPanel();

  const startTime = performance.now();
  const elapsedTimer = startElapsedTimer(startTime);

  try {
    // Stage 1 — Planning
    setAgentStatus("planning");
    setStepActive("plan");
    await wait(450);

    // We don't know yet which tools the agent picked — heuristic guess
    // based on prompt keywords for the *visual* hint while the request runs.
    const guessedTools = guessTools(prompt);
    renderPlanTools(guessedTools);
    setStepDetail("plan-detail", `Selected ${guessedTools.length} tool${guessedTools.length === 1 ? "" : "s"}.`);
    setStepDone("plan");

    // Stage 2 — Executing
    setAgentStatus("executing");
    setStepActive("exec");
    renderExecRows(guessedTools);

    // Fire the actual API call
    const token = await getIdToken();
    const reqPromise = fetch("/api/generate/multimodal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ prompt }),
    });

    const res = await reqPromise;
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Generation failed");

    // Reconcile actual tools used vs guess
    const actualTools = [];
    if (data.text) actualTools.push("text");
    if (data.image_url) actualTools.push("image");

    // Update plan/exec to reflect reality
    renderPlanTools(actualTools);
    renderExecRows(actualTools);
    // Mark each exec row complete in sequence
    for (const t of actualTools) {
      await wait(180);
      markExecDone(t);
    }
    setStepDone("exec");

    // Stage 3 — Done
    setStepActive("done");
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    setStepDetail("done-detail", `Generated in ${elapsed}s`);
    setStepDone("done");
    setAgentStatus("done");

    renderResults(data, prompt);
    loadHistory(); // refresh drawer in background
    setTimeout(() => hideAgentPanel(), 1800);
  } catch (err) {
    showAgentError(err.message || "Something went wrong");
    setAgentStatus("error");
    showToast(err.message || "Generation failed", "error");
  } finally {
    clearInterval(elapsedTimer);
    isGenerating = false;
    setGenerateDisabled(false);
  }
}

function guessTools(prompt) {
  const p = prompt.toLowerCase();
  const wantsImageOnly = /^(image|picture|render|visualiz|show|draw|sketch)/.test(p);
  const wantsTextOnly = /(describe|explain|write|details|specification)/.test(p) && !/(image|render|visual|picture|show)/.test(p);
  if (wantsImageOnly) return ["image"];
  if (wantsTextOnly) return ["text"];
  return ["text", "image"];
}

// ── Agent panel helpers ─────────────────────────────────────
function showAgentPanel() {
  document.getElementById("agent-panel").classList.remove("hidden");
  document.getElementById("agent-panel").classList.remove("error");
}
function hideAgentPanel() {
  document.getElementById("agent-panel").classList.add("hidden");
  setAgentStatus("idle");
}
function resetAgentPanel() {
  document.querySelectorAll(".agent-step").forEach((el) => {
    el.classList.remove("active", "done");
  });
  setStepDetail("plan-detail", "Deciding which tools to use…");
  setStepDetail("done-detail", "Awaiting…");
  document.getElementById("plan-tools").classList.add("hidden");
  document.getElementById("plan-tools").innerHTML = "";
  document.getElementById("exec-rows").innerHTML = "";
  document.getElementById("agent-elapsed").textContent = "0.0s";
}
function setStepActive(name) {
  const el = document.querySelector(`.agent-step[data-step="${name}"]`);
  if (el) el.classList.add("active");
}
function setStepDone(name) {
  const el = document.querySelector(`.agent-step[data-step="${name}"]`);
  if (el) { el.classList.add("done"); el.classList.remove("active"); }
}
function setStepDetail(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
function renderPlanTools(tools) {
  const el = document.getElementById("plan-tools");
  el.classList.remove("hidden");
  el.innerHTML = tools
    .map((t) => `<span class="tool-chip ${t}">${t === "text" ? "📋 Text" : "🖼 Image"}</span>`)
    .join("");
}
function renderExecRows(tools) {
  const el = document.getElementById("exec-rows");
  el.innerHTML = tools
    .map((t) => {
      const label = t === "text" ? "Llama 3 — description" : "Pollinations — image";
      return `
        <div class="exec-row" data-tool="${t}">
          <div class="exec-spinner"></div>
          <div class="label"><span class="name">${t}</span> · ${label}</div>
        </div>`;
    })
    .join("");
}
function markExecDone(tool) {
  const row = document.querySelector(`.exec-row[data-tool="${tool}"]`);
  if (!row) return;
  const spinner = row.querySelector(".exec-spinner");
  if (spinner) {
    spinner.outerHTML = '<div class="exec-check">✓</div>';
  }
}
function setAgentStatus(state) {
  const el = document.getElementById("agent-status");
  const labelMap = { idle: "Idle", planning: "Planning…", executing: "Executing", done: "Done", error: "Error" };
  el.dataset.state = state;
  document.getElementById("status-label").textContent = labelMap[state] || "Idle";
}
function startElapsedTimer(start) {
  const el = document.getElementById("agent-elapsed");
  return setInterval(() => {
    const e = ((performance.now() - start) / 1000).toFixed(1);
    el.textContent = `${e}s`;
  }, 100);
}
function showAgentError(msg) {
  const panel = document.getElementById("agent-panel");
  panel.classList.add("error");
  document.getElementById("agent-error").classList.remove("hidden");
  document.getElementById("agent-error-msg").textContent = msg;
}
function hideAgentError() {
  document.getElementById("agent-error").classList.add("hidden");
}
function setGenerateDisabled(disabled) {
  document.getElementById("btn-generate").disabled = disabled;
}

// ── Results rendering ───────────────────────────────────────
function renderResults(data, prompt) {
  const section = document.getElementById("results-section");
  const textBlock = document.getElementById("text-result");
  const imageBlock = document.getElementById("image-result");

  if (data.text) {
    document.getElementById("text-content").innerHTML = formatDescription(data.text);
    document.getElementById("text-prompt-badge").textContent = "› " + prompt;
    textBlock.classList.remove("hidden");
  } else {
    textBlock.classList.add("hidden");
  }

  if (data.image_url) {
    const img = document.getElementById("result-image");
    const skel = document.getElementById("image-skeleton");
    img.classList.remove("loaded");
    skel.classList.remove("hidden");
    img.onload = () => {
      img.classList.add("loaded");
      skel.classList.add("hidden");
    };
    img.onerror = () => {
      skel.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--red);font-size:13px">Image failed to load</div>';
    };
    img.src = data.image_url;
    document.getElementById("download-image").href = data.image_url;
    document.getElementById("image-prompt-badge").textContent = "› " + prompt;
    imageBlock.classList.remove("hidden");
  } else {
    imageBlock.classList.add("hidden");
  }

  section.classList.remove("hidden");
  setTimeout(() => section.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
}

function hideResults() {
  document.getElementById("results-section").classList.add("hidden");
}

function formatDescription(text) {
  // Light markdown-ish formatting:
  // **bold** → <strong>, lines starting with "1)", "2)"… or ALL CAPS short titles → section titles
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/^(\d+\)[^\n]+)$/gm, '<div class="section-title">$1</div>');
  html = html.replace(/^([A-Z][A-Z\s&\-]{3,40}):/gm, '<div class="section-title">$1</div>');
  html = html.replace(/\n\n/g, "</p><p>");
  html = html.replace(/\n/g, "<br>");
  return "<p>" + html + "</p>";
}

document.getElementById("btn-copy-text").addEventListener("click", () => {
  const text = document.getElementById("text-content").innerText;
  navigator.clipboard.writeText(text).then(() => showToast("Copied to clipboard", "success"));
});

// ── History drawer ──────────────────────────────────────────
const drawer = document.getElementById("history-drawer");
const drawerBackdrop = document.getElementById("drawer-backdrop");

document.getElementById("btn-history").addEventListener("click", openDrawer);
document.getElementById("drawer-close").addEventListener("click", closeDrawer);
drawerBackdrop.addEventListener("click", closeDrawer);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !drawer.classList.contains("hidden")) closeDrawer();
});

function openDrawer() {
  drawer.classList.remove("hidden");
  drawerBackdrop.classList.remove("hidden");
  drawer.setAttribute("aria-hidden", "false");
  loadHistory();
}
function closeDrawer() {
  drawer.classList.add("closing");
  drawerBackdrop.classList.add("hidden");
  setTimeout(() => {
    drawer.classList.add("hidden");
    drawer.classList.remove("closing");
    drawer.setAttribute("aria-hidden", "true");
  }, 250);
}

// Search
const searchInput = document.getElementById("search-input");
let searchTimer = null;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(searchHistory, 300);
});
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { clearTimeout(searchTimer); searchHistory(); }
});

async function searchHistory() {
  const query = searchInput.value.trim();
  if (!query) return loadHistory();
  try {
    const data = await apiPost("/search", { query });
    renderHistory(data.results);
  } catch (err) {
    showToast("Search failed: " + err.message, "error");
  }
}

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
  if (!items || items.length === 0) {
    container.innerHTML = `<p class="empty-state">No concepts yet — generate your first one.</p>`;
    return;
  }
  container.innerHTML = items.map(renderHistoryItem).join("");

  // Attach handlers (event delegation)
  container.querySelectorAll(".history-item").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest(".btn-delete")) return;
      const idx = parseInt(el.dataset.idx, 10);
      loadHistoryItem(items[idx]);
    });
  });
  container.querySelectorAll(".btn-delete").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteOne(btn.dataset.id);
    });
  });
}

function renderHistoryItem(item, idx) {
  const date = new Date(item.created_at).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
  return `
    <div class="history-item" data-idx="${idx}">
      <div class="history-item-head">
        <div class="history-prompt">${escapeHtml(item.prompt)}</div>
        <button class="btn-delete" data-id="${item.id}" title="Delete">🗑</button>
      </div>
      <div class="history-date">${date}</div>
      <div class="history-tags">
        ${item.description ? '<span class="tag tag-text">TEXT</span>' : ""}
        ${item.image_url ? '<span class="tag tag-image">IMAGE</span>' : ""}
      </div>
    </div>
  `;
}

function loadHistoryItem(item) {
  promptInput.value = item.prompt;
  charCount.textContent = item.prompt.length;
  hideResults();
  renderResults(
    { text: item.description, image_url: item.image_url },
    item.prompt,
  );
  closeDrawer();
}

async function deleteOne(id) {
  if (!confirm("Delete this concept?")) return;
  try {
    const token = await getIdToken();
    const res = await fetch(`/api/delete/${id}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token },
    });
    if (!res.ok) throw new Error("Failed");
    showToast("Deleted", "success");
    loadHistory();
  } catch (err) {
    showToast("Delete failed", "error");
  }
}

document.getElementById("btn-clear-history").addEventListener("click", async () => {
  if (!confirm("Delete ALL history? This cannot be undone.")) return;
  try {
    const token = await getIdToken();
    const res = await fetch(`/api/delete`, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token },
    });
    if (!res.ok) throw new Error("Failed");
    showToast("All history cleared", "success");
    loadHistory();
  } catch (err) {
    showToast("Failed to clear history", "error");
  }
});

// ── API helpers ─────────────────────────────────────────────
async function authHeaders() {
  const token = await getIdToken();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
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

// ── UI utilities ────────────────────────────────────────────
function showLoading(msg) {
  document.getElementById("loading-overlay").classList.remove("hidden");
  document.getElementById("loading-msg").textContent = msg || "Processing…";
}
function hideLoading() {
  document.getElementById("loading-overlay").classList.add("hidden");
}

function showToast(msg, type = "info") {
  const stack = document.getElementById("toast-stack");
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  const icon = { success: "✓", error: "✕", warning: "!", info: "i" }[type] || "i";
  el.innerHTML = `<span style="font-family:var(--font-mono);font-weight:700">${icon}</span><span>${escapeHtml(msg)}</span>`;
  stack.appendChild(el);
  setTimeout(() => {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 250);
  }, 3500);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
function escapeAttr(str) {
  return String(str).replace(/"/g, "&quot;");
}
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
