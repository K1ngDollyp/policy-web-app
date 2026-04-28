import "dotenv/config";
import express from "express";

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "50kb" }));

const PORT = Number(process.env.PORT || 5173);
const SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL || "";
const KEEP_WARM_MS = Number(process.env.KEEP_WARM_INTERVAL_MS || 240_000); // 4 minutes
const SHEET_ID = "1pV5sz5PJTTaGvXbUNAVqwWB_-eAC2B5bTe1XEo5tgT4";

app.get("/config", (_req, res) => {
  res.json({
    googleAppsScriptUrlConfigured: Boolean(SCRIPT_URL),
    urlSnippet: SCRIPT_URL ? SCRIPT_URL.slice(0, 30) + "..." : "not set"
  });
});

async function keepWarm() {
  if (!SCRIPT_URL) return;
  try {
    await fetch(SCRIPT_URL, { method: "GET" });
  } catch {
    // ignore
  }
}

app.post("/user-config", async (req, res) => {
  try {
    if (!SCRIPT_URL) {
      res.status(500).json({ ok: false, error: "Missing GOOGLE_APPS_SCRIPT_URL" });
      return;
    }
    const { email } = req.body || {};
    const params = new URLSearchParams({ action: "get_config", email });
    const url = `${SCRIPT_URL}${SCRIPT_URL.includes("?") ? "&" : "?"}${params.toString()}`;

    const upstream = await fetch(url, { method: "GET" });
    const text = await upstream.text();
    let json;
    try { json = JSON.parse(text); } catch {
      res.status(502).json({ ok: false, error: "Non-JSON response from Apps Script" });
      return;
    }
    res.status(upstream.ok ? 200 : 502).json(json);
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

app.post("/submit", async (req, res) => {
  try {
    if (!SCRIPT_URL) {
      res.status(500).json({ ok: false, error: "Server is missing GOOGLE_APPS_SCRIPT_URL." });
      return;
    }

    const { email, delivery_id, policy } = req.body || {};
    const params = new URLSearchParams({ action: "submit", email, delivery_id, policy });
    const url = `${SCRIPT_URL}${SCRIPT_URL.includes("?") ? "&" : "?"}${params.toString()}`;

    console.log(`Submitting to Apps Script: ${url.slice(0, 100)}...`);

    const upstream = await fetch(url, { method: "GET" });
    const text = await upstream.text();
    
    console.log(`Apps Script Status: ${upstream.status}`);

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      console.error(`Apps Script non-JSON response: ${text.slice(0, 200)}`);
      res.status(502).json({ ok: false, error: "Invalid response from Google" });
      return;
    }

    if (!json.ok) console.error("Apps Script Error JSON:", json);
    res.status(upstream.ok ? 200 : 502).json(json);
  } catch (err) {
    console.error("Submission Exception:", err);
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

app.get("/sheet", async (_req, res) => {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 20_000);
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&t=${Date.now()}`;
    const upstream = await fetch(url, { signal: controller.signal });
    clearTimeout(t);

    if (!upstream.ok) {
      res.status(502).json({ ok: false, error: `Failed to fetch sheet CSV (${upstream.status})` });
      return;
    }

    const csv = await upstream.text();
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.send(csv);
  } catch (err) {
    const msg =
      err && (err.name === "AbortError" || String(err).includes("aborted"))
        ? "Timed out fetching sheet data"
        : String(err?.message || err);
    res.status(504).json({ ok: false, error: msg });
  }
});

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "../public")));

// Export the app for Vercel
export default app;

if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    if (!SCRIPT_URL) {
      console.log(
        "GOOGLE_APPS_SCRIPT_URL is not set yet. See README.md to configure saving answers."
      );
    } else {
      keepWarm();
      if (Number.isFinite(KEEP_WARM_MS) && KEEP_WARM_MS > 30_000) {
        setInterval(keepWarm, KEEP_WARM_MS).unref();
      }
    }
  });
}
