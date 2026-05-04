const $ = (sel) => document.querySelector(sel);

// Screens
const screenEmail = $("#screen-email");
const screenCard = $("#screen-card");
const screenDone = $("#screen-done");
const loadingOverlay = $("#loading-overlay");
const loaderText = $("#loader-text");

// Form elements
const emailForm = $("#email-form");
const emailInput = $("#input-email");
const emailError = $("#email-error");
const startBtn = $("#start-btn");
const exportBtn = document.getElementById("exportBtn");

exportBtn.addEventListener("click", exportData);

async function exportData() {
  const password = prompt("Enter Admin Password to export data:");
  if (password !== "admin123") {
    alert("Incorrect password.");
    return;
  }

  try {
    exportBtn.disabled = true;
    exportBtn.textContent = "Exporting...";
    
    const res = await fetch("/api/sheet");
    if (!res.ok) throw new Error("Failed to fetch sheet data.");
    
    const csvText = await res.text();
    const rows = parseCsv(csvText);
    
    // Filter rows that have a policy
    const filled = rows.filter(r => String(r.policy || "").trim().length > 0);
    
    if (filled.length === 0) {
      alert("No classified entries found to export.");
      return;
    }
    
    // Convert back to CSV
    const headers = Object.keys(filled[0]);
    const csvContent = [
      headers.join(","),
      ...filled.map(row => headers.map(h => `"${String(row[h] || "").replace(/"/g, '""')}"`).join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `classified_deliveries_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
  } catch (err) {
    alert("Export failed: " + err.message);
  } finally {
    exportBtn.disabled = false;
    exportBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg> Export Data`;
  }
}

// Card elements
const cardDescription = $("#card-description");
const cardId = $("#card-id");
const cardAttrs = $("#card-attrs");
const progressBadge = $("#progress-badge span");
const progressFill = $("#progress-fill");
const emailBadge = $("#email-badge");
const policyChips = $("#policy-chips");
const answerStatus = $("#answer-status");
const skipBtn = $("#skip-btn");
const submitBtn = $("#submit-btn");
const changeEmailBtn = $("#change-email-btn");

// Done elements
const doneStats = $("#done-stats");
const doneRestartBtn = $("#done-restart-btn");

let state = {
  email: "",
  allRows: [],
  assignedRows: [],
  currentIndex: 0,
  savedCount: 0,
  quota: 4000, // Updated to 4000 as per request
  policyOptions: ["Car", "Bike", "Commuter"]
};

function showScreen(screen) {
  [screenEmail, screenCard, screenDone].forEach(s => s.classList.add("hidden"));
  screen.classList.remove("hidden");
}

function setLoading(isLoading, text = "Loading...") {
  loaderText.textContent = text;
  loadingOverlay.classList.toggle("hidden", !isLoading);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function seededShuffle(array, seed) {
  const hash = await sha256(seed);
  let seedNum = parseInt(hash.slice(0, 8), 16);
  
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    seedNum = (seedNum * 9301 + 49297) % 233280;
    const rnd = seedNum / 233280;
    const j = Math.floor(rnd * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function parseCsv(csv) {
  const lines = csv.split(/\r?\n/);
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  return lines.slice(1).filter(line => line.trim()).map(line => {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') inQuotes = !inQuotes;
      else if (line[i] === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else current += line[i];
    }
    values.push(current.trim());
    
    const obj = {};
    headers.forEach((h, i) => obj[h] = values[i] || "");
    return obj;
  });
}

// ... existing code ...
const savedEmail = localStorage.getItem("delivery_app_email");
if (savedEmail) {
  emailInput.value = savedEmail;
}

async function startSession() {
  const email = normalizeEmail(emailInput.value);
  if (!email || !email.includes("@")) {
    emailError.textContent = "Please enter a valid work email.";
    return;
  }
  
  localStorage.setItem("delivery_app_email", email);
  state.email = email;
  setLoading(true, "Fetching delivery data...");
  
  try {
    const res = await fetch("/api/sheet");
    if (!res.ok) throw new Error("Failed to load spreadsheet data.");
    const csv = await res.text();
    const rows = parseCsv(csv);
    
    // Header names are: "delivery_id", "policy", "Work Email", etc.
    // Calculate live progress for this user
    state.savedCount = rows.filter(r => normalizeEmail(r["Work Email"]) === email).length;
    
    // Filter rows: only those that don't have a policy AND don't have a Work Email
    const unassigned = rows.filter(r => {
      const hasPolicy = String(r.policy || "").trim().length > 0;
      const hasEmail = String(r["Work Email"] || "").trim().length > 0;
      return !hasPolicy && !hasEmail;
    });
    
    // Shuffle based on email for unique ordering
    state.assignedRows = await seededShuffle(unassigned, email);
    state.currentIndex = 0;
    
    // Optional: Fetch custom user quota from config
    try {
      const qRes = await fetch("/api/user-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      if (qRes.ok) {
        const qData = await qRes.json();
        if (qData.quota) state.quota = qData.quota;
      }
    } catch (e) { console.warn("Could not fetch custom quota", e); }
    
    emailBadge.textContent = email;
    renderCard();
    showScreen(screenCard);
  } catch (err) {
    emailError.textContent = err.message;
  } finally {
    setLoading(false);
  }
}

function renderCard() {
  if (state.currentIndex >= state.assignedRows.length || state.savedCount >= state.quota) {
    finishSession();
    return;
  }
  
  const row = state.assignedRows[state.currentIndex];
  cardDescription.textContent = row.description || "No description available";
  cardId.textContent = `ID: ${row.delivery_id || "N/A"}`;
  
  // Update progress
  const progress = (state.savedCount / state.quota) * 100;
  progressFill.style.width = `${progress}%`;
  progressBadge.textContent = `${state.savedCount} / ${state.quota}`;
  
  // Render attributes
  cardAttrs.innerHTML = "";
  const attrs = [
    { key: "Distance", val: row.distance ? `${row.distance} km` : "N/A" },
    { key: "Weight", val: row.weight ? `${row.weight} kg` : "N/A" },
    { key: "Packages", val: row.no_of_package || "N/A" },
    { key: "Value", val: row.package_value || "N/A" },
    { key: "Handling", val: row.handling_tag || "N/A" },
    { key: "Type", val: row.package_type || "N/A" }
  ];
  
  attrs.forEach(a => {
    const div = document.createElement("div");
    div.className = "attr";
    div.innerHTML = `<span class="attr-key">${a.key}</span><span class="attr-val">${a.val}</span>`;
    cardAttrs.appendChild(div);
  });
  
  // Render policy chips
  renderPolicyChips();
  answerStatus.textContent = "";
  submitBtn.disabled = true;
}

function renderPolicyChips() {
  policyChips.innerHTML = "";
  state.policyOptions.forEach(opt => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.textContent = opt;
    chip.onclick = () => {
      chip.classList.toggle("selected");
      // Enable submit if at least one is selected
      submitBtn.disabled = document.querySelectorAll(".chip.selected").length === 0;
    };
    policyChips.appendChild(chip);
  });
}

async function submitAnswer() {
  const selected = document.querySelectorAll(".chip.selected");
  if (selected.length === 0) return;
  
  const policy = Array.from(selected).map(c => c.textContent).join(", ");
  const row = state.assignedRows[state.currentIndex];
  
  // OPTIMISTIC UPDATE: Move to next card immediately
  state.savedCount++;
  state.currentIndex++;
  renderCard();
  
  // Background Save
  fetch("/api/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: state.email,
      delivery_id: row.delivery_id,
      policy: policy
    })
  }).then(res => res.json()).then(data => {
    if (!data.ok) {
      console.error("Background save failed:", data.error);
      answerStatus.textContent = "Warning: Last answer failed to save. " + data.error;
      answerStatus.className = "hint error";
    }
  }).catch(err => {
    console.error("Background save error:", err);
    answerStatus.textContent = "Connection error. Last answer might not have saved.";
    answerStatus.className = "hint error";
  });
}

function finishSession() {
  doneStats.textContent = `You completed ${state.savedCount} flashcards!`;
  showScreen(screenDone);
}

// Event Listeners
emailForm.onsubmit = (e) => {
  e.preventDefault();
  startSession();
};

submitBtn.onclick = submitAnswer;
skipBtn.onclick = () => {
  state.currentIndex++;
  renderCard();
};

changeEmailBtn.onclick = () => {
  showScreen(screenEmail);
};

doneRestartBtn.onclick = () => {
  emailInput.value = "";
  showScreen(screenEmail);
};
