const express = require("express");
const fs = require("fs");
const path = require("path");
const https = require("https");

const app = express();
const PORT = process.env.PORT || 3000;

// === Pautas: archivos de log ===
const PAUTA_LOG      = path.join(__dirname, "data", "pautaLog.json");
const PAUTA_LOG_TEST = path.join(__dirname, "data", "pautaLog-test.json");

// Asegurar que existan
for (const f of [PAUTA_LOG, PAUTA_LOG_TEST]) {
  try { if (!fs.existsSync(f)) fs.writeFileSync(f, "[]"); } catch {}
}

// Detección robusta del entorno Render
const isRender = process.env.RENDER || process.env.RENDER_EXTERNAL_URL || process.env.PORT;
const baseDir = isRender
  ? path.join(__dirname, "data")
  : path.join("C:", "Temp", "proveedores", "data");

let proveedores = [];
let proFru = [];
let lastUpdate = { fecha: "Desconocida" };
let webhookURL = "https://script.google.com/macros/s/AKfycbw8lL7K2t2co2Opujs8Z95fA61hKsU0ddGV6NKV2iFx8338Fq_PbB5vr_C7UbVlGYOj/exec";

// === NUEVO: WebApp de Google para Aceptaciones de Pauta ===
// Podés moverlo a variable de entorno GAS_PAUTA_URL si preferís.
const GAS_PAUTA_URL = "https://script.google.com/macros/s/AKfycbwsk73HmLipucNrJw4L3VfoQ_t1oGfTpelb-89YlxhJBwdR7E8LkzYqbFlc1cxf-rEd/exec";

// Cargar archivos de manera segura
try {
  proveedores = JSON.parse(fs.readFileSync(path.join(baseDir, "proveedores.json"), "utf8"));
  console.log(`✔ Cargado proveedores.json (${proveedores.length} registros)`);
} catch (err) {
  console.error("❌ Error al leer proveedores.json:", err.message);
}

try {
  proFru = JSON.parse(fs.readFileSync(path.join(baseDir, "profru.json"), "utf8"));
  console.log(`✔ Cargado profru.json (${proFru.length} registros)`);
} catch (err) {
  console.error("❌ Error al leer profru.json:", err.message);
}

try {
  lastUpdate = JSON.parse(fs.readFileSync(path.join(baseDir, "lastUpdate.json"), "utf8"));
  console.log(`✔ Cargado lastUpdate.json: ${lastUpdate.fecha}`);
} catch (err) {
  console.error("❌ Error al leer lastUpdate.json:", err.message);
}

console.log("✔ Webhook cargado correctamente");

// 👉 Servir PDFs de pauta (para el iframe de index.html)
app.use('/data', express.static(path.join(__dirname, 'data')));

// Middleware
app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Página principal
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Página para celular
app.get("/index-celu.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index-celu.html"));
});

// Endpoint de login (mantiene tu webhook de Accesos)
app.post("/login", (req, res) => {
  const { cui, password } = req.body;
  const cuiLimpio = (cui || "").replace(/[^0-9]/g, "");

  const proveedor = proveedores.find(p =>
    String(p.cui || "").replace(/[^0-9]/g, "") === cuiLimpio &&
    String(p.clave || "").trim() === String(password || "").trim()
  );

  if (!proveedor) {
    return res.status(401).send("CUIT o clave incorrectos");
  }

  // Enviar log de acceso a Google Sheets (Accesos)
  if (webhookURL) {
    const postData = JSON.stringify({
      nombre: proveedor.nombre,
      cuit: cuiLimpio
    });

    const reqGS = https.request(webhookURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    }, resGS => {
      // opcional: logs
      resGS.on("data", () => {});
    });

    reqGS.on("error", (err) => {
      console.error("❌ Error al conectar con Google Sheets (Accesos):", err.message);
    });

    reqGS.write(postData);
    reqGS.end();
  } else {
    console.warn("⚠ Webhook no disponible, no se registró el acceso.");
  }

  const entregas = proFru.filter(e => e.ProveedorT === proveedor.nombre);
  const totalKgs = entregas.reduce((suma, e) => suma + (parseFloat(e.KgsD) || 0), 0);

  // incluir 'org' para que el front muestre Pauta Orgánica si corresponde
  res.json({
    proveedor: proveedor.nombre,
    org: proveedor.org || "",
    entregas,
    resumen: { totalKgs },
    ultimaActualizacion: lastUpdate.fecha || "Fecha desconocida"
  });
});

// ===== Estado de firma de pauta (lee JSON local)
app.get("/api/pauta/estado", (req, res) => {
  const cuit = String(req.query.cuit || "").replace(/[^0-9]/g, "");
  if (!cuit) return res.status(400).json({ error: "CUIT requerido" });

  let arr = [];
  try { arr = JSON.parse(fs.readFileSync(PAUTA_LOG, "utf8")); } catch {}

  const ultimo = (tipo) => {
    for (let i = arr.length - 1; i >= 0; i--) {
      const r = arr[i];
      if (r.cuit === cuit && r.tipo === tipo) return r;
    }
    return null;
  };

  const p = ultimo("pauta");
  const o = ultimo("pautaorganica");

  res.json({
    pauta:         p ? { firmado: true, fechaLocal: p.fechaLocal } : { firmado: false },
    pautaorganica: o ? { firmado: true, fechaLocal: o.fechaLocal } : { firmado: false }
  });
});

// ===== Registrar firma de pauta (guarda JSON + manda a Sheets)
app.post("/api/pauta/firmar", (req, res) => {
  try {
    const { tipo, acepta, responsable, cargo, proveedor, cuit, test } = req.body || {};

    if (!["pauta","pautaorganica"].includes(tipo)) return res.status(400).json({ error: "tipo inválido" });
    if (!acepta) return res.status(400).json({ error: "Debe aceptar la pauta" });

    const cuitNum = String(cuit || "").replace(/[^0-9]/g, "");
    if (!cuitNum || !proveedor || !responsable || !cargo) {
      return res.status(400).json({ error: "Datos incompletos" });
    }

    const fechaLocal = new Date().toLocaleString("es-AR", {
      day:"2-digit", month:"2-digit", year:"numeric",
      hour:"2-digit", minute:"2-digit"
    }).replace(",", "");

    // 1) Guardar en log (real o de pruebas)
    const file = test ? PAUTA_LOG_TEST : PAUTA_LOG;
    let arr = [];
    try { arr = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
    arr.push({ tipo, proveedor, cuit: cuitNum, responsable, cargo, fechaLocal, iso: new Date().toISOString() });
    fs.writeFileSync(file, JSON.stringify(arr, null, 2));

    // 2) Enviar a Google Sheets (omitido si test=1)
    if (!test && GAS_PAUTA_URL) {
      const payload = {
        accion: "aceptacion_pauta",
        modo: "registrar",
        timestamp: new Date().toISOString(),
        cuit: cuitNum,
        nombre: proveedor,
        tipo: (tipo === "pautaorganica") ? "pauta_organica" : "pauta",
        responsable,
        cargo,
        userAgent: req.headers["user-agent"] || ""
      };

      const data = JSON.stringify(payload);
      const u = new URL(GAS_PAUTA_URL);
      const reqGS = https.request({
        protocol: u.protocol,
        hostname: u.hostname,
        path: u.pathname + (u.search || ""),
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
      }, r => { r.on("data", () => {}); });

      reqGS.on("error", err => console.error("❌ Apps Script (registrar) error:", err.message));
      reqGS.write(data);
      reqGS.end();
    }

    res.json({ ok: true, fechaLocal });
  } catch (e) {
    console.error("Error /api/pauta/firmar:", e);
    res.status(500).json({ error: "Error interno" });
  }
});

// ===== Borrar última firma (por CUIT + tipo) para pruebas
app.post("/api/pauta/borrar", (req, res) => {
  try {
    const { cuit, tipo, test } = req.body || {};
    const cuitNum = String(cuit || "").replace(/[^0-9]/g, "");
    if (!cuitNum || !["pauta","pautaorganica"].includes(tipo)) {
      return res.status(400).json({ ok:false, error:"Parámetros inválidos" });
    }

    // 1) Borrar del JSON local (última coincidencia)
    const file = test ? PAUTA_LOG_TEST : PAUTA_LOG;
    let arr = [];
    try { arr = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i].cuit === cuitNum && arr[i].tipo === tipo) { arr.splice(i, 1); break; }
    }
    fs.writeFileSync(file, JSON.stringify(arr, null, 2));

    // 2) Pedir al Apps Script que borre en Sheets (omitido si test=1)
    if (!test && GAS_PAUTA_URL) {
      const payload = { accion:"aceptacion_pauta", modo:"borrar",
        cuit: cuitNum, tipo: (tipo === "pautaorganica") ? "pauta_organica" : "pauta" };

      const data = JSON.stringify(payload);
      const u = new URL(GAS_PAUTA_URL);
      const rq = https.request({
        protocol: u.protocol,
        hostname: u.hostname,
        path: u.pathname + (u.search || ""),
        method: "POST",
        headers: { "Content-Type":"application/json", "Content-Length": Buffer.byteLength(data) }
      }, r => { r.on("data", () => {}); });

      rq.on("error", err => console.error("❌ Apps Script (borrar) error:", err.message));
      rq.write(data);
      rq.end();
    }

    res.json({ ok:true });
  } catch (e) {
    console.error("Error /api/pauta/borrar:", e);
    res.status(500).json({ ok:false, error:"Error interno" });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor funcionando en http://localhost:${PORT}`);
});
