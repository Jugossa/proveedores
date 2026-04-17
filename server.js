const express = require("express");
const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Render vs Local:
 * - Render: __dirname/data
 * - Local/red: I:\Pagina\proveedores\data
 */
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
    console.log(
      `✔ Cargado ${nombre} (${Array.isArray(data) ? data.length : "objeto"} registros)`
    );
    return data;
  } catch (err) {
    console.error(`❌ Error al leer ${nombre}:`, err.message);
    return fallback;
  }
}

// Cookies sin dependencias externas
function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
}

function setCookie(res, name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  if (opts.secure) parts.push("Secure");
  parts.push(`Path=${opts.path || "/"}`);
  res.setHeader("Set-Cookie", parts.join("; "));
}

// Helper GET JSON sin librerías externas
// FIX: sigue redirects de Apps Script
function getJson(url, timeoutMs = 10000, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    function requestJson(currentUrl, redirectsLeft) {
      const req = https.get(currentUrl, (res) => {
        const status = res.statusCode || 0;
        const location = res.headers.location;

        if (
          [301, 302, 303, 307, 308].includes(status) &&
          location &&
          redirectsLeft > 0
        ) {
          const nextUrl = new URL(location, currentUrl).toString();
          res.resume();
          return requestJson(nextUrl, redirectsLeft - 1);
        }

        let body = "";

        res.on("data", (chunk) => {
          body += chunk;
        });

        res.on("end", () => {
          try {
            const data = JSON.parse(body || "{}");
            resolve({ statusCode: status, data, raw: body });
          } catch (err) {
            reject(
              new Error(
                `respuesta_invalida_apps_script: ${err.message} | body=${body}`
              )
            );
          }
        });
      });

      req.on("error", reject);

      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error("timeout_consulta_apps_script"));
      });
    }

    requestJson(url, maxRedirects);
  });
}

// -------------------- Datos en memoria --------------------
let proveedores = [];
let proFru = [];
let proFru25 = [];
let ingresosDiarios = [];
let proCert = [];
let lastUpdate = { fecha: "Desconocida" };

function recargarTodo() {
  proveedores = cargarJSON("proveedores.json", []);
  proFru = cargarJSON("profru.json", []);
  proFru25 = cargarJSON("ProFru25.json", []);
  ingresosDiarios = cargarJSON("ingresosDiarios.json", []);
  proCert = cargarJSON("ProCert.json", []);
  lastUpdate = cargarJSON("lastUpdate.json", { fecha: "Desconocida" }) || {
    fecha: "Desconocida",
  };
  console.log("✔ Datos cargados correctamente");
}
recargarTodo();

// -------------------- Webhooks --------------------
const webhookAccesosURL =
  "https://script.google.com/macros/s/AKfycbw8lL7K2t2co2Opujs8Z95fA61hKsU0ddGV6NKV2iFx8338Fq_PbB5vr_C7UbVlGYOj/exec";

const webhookPautaURL =
  "https://script.google.com/macros/s/AKfycbxI3ENlw27gbPwgoujI8vtWXO2jvWWUnAwEvtLbPJw-w2F4PVia-UIEFkR_ENriKbWf/exec";

// -------------------- Auth simple (cookie + token en memoria) --------------------
const TOKENS = new Map(); // token -> { nombre, cuit, tipo, org, issuedAt }
const TOKEN_TTL_SEC = 60 * 60 * 12; // 12 horas

function issueToken(payload) {
  const token = crypto.randomBytes(24).toString("hex");
  TOKENS.set(token, { ...payload, issuedAt: Date.now() });
  return token;
}

function cleanupTokens() {
  const now = Date.now();
  for (const [t, v] of TOKENS.entries()) {
    if (now - (v.issuedAt || 0) > TOKEN_TTL_SEC * 1000) TOKENS.delete(t);
  }
}

function requireAuth(req, res, next) {
  cleanupTokens();
  const cookies = parseCookies(req);
  const token = cookies.auth || "";
  const session = TOKENS.get(token);
  if (!session) return res.status(401).json({ ok: false, error: "no_auth" });
  req.user = session;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.tipo !== "admin")
    return res.status(403).json({ ok: false, error: "forbidden" });
  next();
}

// -------------------- Middleware --------------------
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public")));

// Servir /data (JSON + PDFs)
app.use("/data", express.static(baseDir, { etag: false, maxAge: 0 }));

// Root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.get("/index-celu.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index-celu.html"));
});

// -------------------- LOGIN --------------------
app.post("/login", (req, res) => {
  const { cui, password } = req.body;
  const cuiLimpio = (cui || "").replace(/[^0-9]/g, "");

  const proveedor = proveedores.find(
    (p) =>
      (p.cui || "").replace(/[^0-9]/g, "") === cuiLimpio &&
      String(p.clave || "").trim() === String(password || "").trim()
  );

  if (!proveedor) {
    return res.status(401).send("CUIT o clave incorrectos");
  }

  // Log acceso a Google Sheets (no bloquea)
  if (webhookAccesosURL) {
    const postData = JSON.stringify({
      tipoRegistro: "acceso",
      nombre: proveedor.nombre,
      cuit: cuiLimpio,
    });

    const reqGS = https.request(
      webhookAccesosURL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
        },
      },
      (resGS) => {
        console.log(`🟢 ACCESO -> Google respondió: ${resGS.statusCode}`);
        resGS.on("data", () => {});
      }
    );

    reqGS.on("error", (err) => {
      console.error("❌ Error webhook ACCESO:", err.message);
    });

    reqGS.write(postData);
    reqGS.end();
  }

  const isAdmin = cuiLimpio === "692018";
  const tipo = isAdmin ? "admin" : "proveedor";

  const token = issueToken({
    tipo,
    nombre: proveedor.nombre || (isAdmin ? "ADMINISTRADOR" : ""),
    cuit: cuiLimpio,
    org: proveedor.org || proveedor.Org || "",
  });

  setCookie(res, "auth", token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: isRender,
    maxAge: TOKEN_TTL_SEC,
    path: "/",
  });

  return res.json({
    ok: true,
    tipo,
    proveedor: proveedor.nombre || (isAdmin ? "ADMINISTRADOR" : ""),
    org: proveedor.org || proveedor.Org || "",
    ultimaActualizacion: lastUpdate.fecha || "Fecha desconocida",
  });
});

app.post("/logout", (req, res) => {
  const cookies = parseCookies(req);
  const token = cookies.auth;
  if (token) TOKENS.delete(token);
  setCookie(res, "auth", "", {
    httpOnly: true,
    sameSite: "Lax",
    secure: isRender,
    maxAge: 0,
    path: "/",
  });
  res.json({ ok: true });
});

// -------------------- ENDPOINTS QUE TU PÁGINA NECESITA --------------------
app.get("/profru", requireAuth, (req, res) => {
  if (req.user.tipo === "admin") return res.json(proFru || []);
  const prov = norm(req.user.nombre);
  const rows = (proFru || []).filter((e) => norm(e.ProveedorT) === prov);
  res.json(rows);
});

app.get("/profru25", requireAuth, (req, res) => {
  if (req.user.tipo === "admin") return res.json(proFru25 || []);
  const prov = norm(req.user.nombre);
  const rows = (proFru25 || []).filter((e) => norm(e.ProveedorT) === prov);
  res.json(rows);
});

app.get("/lastUpdate", (req, res) => {
  res.json(lastUpdate || { fecha: "Desconocida" });
});

// -------------------- PAUTAS --------------------
app.get("/api/pauta/estado", async (req, res) => {
  const cuit = (req.query.cuit || "").replace(/[^0-9]/g, "");
  const tipo = String(req.query.tipo || "pauta").trim().toLowerCase();

  if (!cuit) {
    return res.json({ ok: false, error: "cuit_requerido" });
  }

  if (!webhookPautaURL) {
    return res
      .status(500)
      .json({ ok: false, error: "webhook_no_configurado" });
  }

  try {
    const url =
      `${webhookPautaURL}?cuit=${encodeURIComponent(cuit)}` +
      `&tipo=${encodeURIComponent(tipo)}`;

    const result = await getJson(url);

    if (!result?.data || result.data.ok === false) {
      return res.json(
        result?.data || { ok: false, error: "respuesta_apps_script_invalida" }
      );
    }

    return res.json(result.data);
  } catch (err) {
    console.error("❌ Error consultando estado de pauta:", err.message);
    return res.status(500).json({
      ok: false,
      error: "error_consulta_pauta",
      detail: err.message,
    });
  }
});

app.post("/api/pauta/firmar", (req, res) => {
  const { tipo, acepta, responsable, cargo, proveedor, cuit } = req.body;
  const cuitLimpio = (cuit || "").replace(/[^0-9]/g, "");

  if (!acepta || !proveedor || !cuitLimpio || !responsable || !cargo) {
    return res.status(400).json({ ok: false, error: "datos_incompletos" });
  }

  if (!webhookPautaURL) {
    return res.status(500).json({ ok: false, error: "webhook_no_configurado" });
  }

  const ahora = new Date();
  const fechaLocal = ahora
    .toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
    .replace(",", "");

  let tipoNormalizado = (tipo || "").toString().trim().toLowerCase();
  if (!tipoNormalizado) tipoNormalizado = "pauta";

  const payload = {
    proveedor,
    cuit: cuitLimpio,
    responsable,
    cargo,
    tipo: tipoNormalizado,
    fechaLocal,
  };

  const postData = JSON.stringify(payload);

  const reqGS = https.request(
    webhookPautaURL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    },
    (resGS) => {
      console.log("⬅ Respuesta Apps Script PAUTA:", resGS.statusCode);
      res.json({ ok: true, fechaLocal, tipo: tipoNormalizado });
    }
  );

  reqGS.on("error", (err) => {
    console.error("❌ Error al enviar PAUTA:", err.message);
    return res
      .status(500)
      .json({ ok: false, error: "error_webhook", detail: err.message });
  });

  reqGS.write(postData);
  reqGS.end();
});

// -------------------- ADMIN --------------------
app.get("/admin/ingresos", requireAuth, requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin", "ingresos.html"));
});

app.get("/api/admin/ingresos-diarios", requireAuth, requireAdmin, (req, res) => {
  res.json(ingresosDiarios || []);
});

app.get("/api/admin/procert", requireAuth, requireAdmin, (req, res) => {
  res.json(proCert || []);
});

app.get("/api/admin/profru25", requireAuth, requireAdmin, (req, res) => {
  res.json(proFru25 || []);
});

app.post("/api/admin/recargar", requireAuth, requireAdmin, (req, res) => {
  recargarTodo();
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor funcionando en http://localhost:${PORT}`);
});