const express = require("express");
const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

const isRender = Boolean(process.env.RENDER || process.env.RENDER_EXTERNAL_URL);
const baseDir = isRender
  ? path.join(__dirname, "data")
  : path.join("I:", "Pagina", "proveedores", "data");

// -------------------- Helpers --------------------
function norm(s) {
  return (s ?? "")
    .toString()
    .normalize("NFKD")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function safeJsonParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function cargarJSON(nombre, fallback) {
  const fullPath = path.join(baseDir, nombre);
  try {
    const raw = fs.readFileSync(fullPath, "utf8");
    const data = safeJsonParse(raw, fallback);
    return data;
  } catch {
    return fallback;
  }
}

// 🔧 FIX CRÍTICO: ahora sigue redirects de Apps Script
function getJson(url, timeoutMs = 10000, maxRedirects = 5) {
  return new Promise((resolve, reject) => {

    function request(currentUrl, redirectsLeft) {
      const req = https.get(currentUrl, (res) => {
        const status = res.statusCode || 0;

        // 👉 manejar redirect de Apps Script
        if ([301,302,303,307,308].includes(status) && res.headers.location && redirectsLeft > 0) {
          const nextUrl = new URL(res.headers.location, currentUrl).toString();
          return request(nextUrl, redirectsLeft - 1);
        }

        let body = "";

        res.on("data", chunk => body += chunk);

        res.on("end", () => {
          try {
            const data = JSON.parse(body || "{}");
            resolve({ statusCode: status, data, raw: body });
          } catch (err) {
            reject(new Error("respuesta_invalida_apps_script: " + body));
          }
        });
      });

      req.on("error", reject);

      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error("timeout_consulta_apps_script"));
      });
    }

    request(url, maxRedirects);
  });
}

// -------------------- Webhooks --------------------
const webhookPautaURL =
  "https://script.google.com/macros/s/AKfycbxI3ENlw27gbPwgoujI8vtWXO2jvWWUnAwEvtLbPJw-w2F4PVia-UIEFkR_ENriKbWf/exec";

// -------------------- API --------------------
app.get("/api/pauta/estado", async (req, res) => {
  const cuit = (req.query.cuit || "").replace(/[^0-9]/g, "");
  const tipo = String(req.query.tipo || "pauta").trim().toLowerCase();

  if (!cuit) {
    return res.json({ ok: false, error: "cuit_requerido" });
  }

  try {
    const url =
      `${webhookPautaURL}?cuit=${encodeURIComponent(cuit)}` +
      `&tipo=${encodeURIComponent(tipo)}`;

    const result = await getJson(url);

    return res.json(result.data);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "error_consulta_pauta",
      detail: err.message,
    });
  }
});

app.listen(PORT, () => {
  console.log("Servidor funcionando OK");
});