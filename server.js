const express = require("express");
const fs = require("fs");
const path = require("path");
const https = require("https");

const app = express();
const PORT = process.env.PORT || 3000;

/* ========= LOG LOCAL DE PAUTAS ========= */
const DATA_DIR = path.join(__dirname, "data");
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
const PAUTA_LOG      = path.join(DATA_DIR, "pautaLog.json");
const PAUTA_LOG_TEST = path.join(DATA_DIR, "pautaLog-test.json");
for (const f of [PAUTA_LOG, PAUTA_LOG_TEST]) {
  try { if (!fs.existsSync(f)) fs.writeFileSync(f, "[]"); } catch {}
}

/* ========= DONDE ESTÁN TUS DATOS ========= */
const isRender = process.env.RENDER || process.env.RENDER_EXTERNAL_URL || process.env.PORT;
const baseDir = isRender
  ? path.join(__dirname, "data")
  : path.join("C:", "Temp", "proveedores", "data");

/* ========= CARGA INICIAL ========= */
let proveedores = [];
let proFru = [];
let lastUpdate = { fecha: "Desconocida" };

// Webhook ACTUAL para “Accesos” del login (dejalo como está)
let webhookURL = "https://script.google.com/macros/s/AKfycbw8lL7K2t2co2Opujs8Z95fA61hKsU0ddGV6NKV2iFx8338Fq_PbB5vr_C7UbVlGYOj/exec";

// NUEVO: WebApp para “AceptacionesPauta”
const GAS_PAUTA_URL = "https://script.google.com/macros/s/AKfycbwsk73HmLipucNrJw4L3VfoQ_t1oGfTpelb-89YlxhJBwdR7E8LkzYqbFlc1cxf-rEd/exec";

// helpers
function safeReadArray(file){ try { return JSON.parse(fs.readFileSync(file,"utf8")); } catch { return []; } }
function safeWriteArray(file, arr){ try { fs.writeFileSync(file, JSON.stringify(arr,null,2)); } catch {} }
function postJSON(urlStr, payload){
  return new Promise((resolve,reject)=>{
    if(!urlStr) return resolve({ ok:false, skipped:true });
    const u = new URL(urlStr);
    const data = JSON.stringify(payload||{});
    const req = https.request({
      protocol: u.protocol, hostname: u.hostname, path: u.pathname+(u.search||""),
      method:"POST", headers:{ "Content-Type":"application/json", "Content-Length":Buffer.byteLength(data) }
    }, r=>{ let body=""; r.on("data",ch=>body+=ch); r.on("end",()=>{ try{ resolve(JSON.parse(body||"{}")); }catch{ resolve({ ok:false, body }); } }); });
    req.on("error", reject); req.write(data); req.end();
  });
}

try {
  proveedores = JSON.parse(fs.readFileSync(path.join(baseDir, "proveedores.json"), "utf8"));
  console.log(`✔ Cargado proveedores.json (${proveedores.length} registros)`);
} catch (err) { console.error("❌ Error al leer proveedores.json:", err.message); }

try {
  proFru = JSON.parse(fs.readFileSync(path.join(baseDir, "profru.json"), "utf8"));
  console.log(`✔ Cargado profru.json (${proFru.length} registros)`);
} catch (err) { console.error("❌ Error al leer profru.json:", err.message); }

try {
  lastUpdate = JSON.parse(fs.readFileSync(path.join(baseDir, "lastUpdate.json"), "utf8"));
  console.log(`✔ Cargado lastUpdate.json: ${lastUpdate.fecha}`);
} catch (err) { console.error("❌ Error al leer lastUpdate.json:", err.message); }

/* ========= STATIC ========= */
app.use('/data', express.static(path.join(__dirname, 'data'))); // PDFs de pauta
app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ========= PÁGINAS ========= */
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/index-celu.html", (req, res) => res.sendFile(path.join(__dirname, "public", "index-celu.html")));

/* ========= LOGIN (con log de Accesos) ========= */
app.post("/login", (req, res) => {
  const { cui, password } = req.body;
  const cuiLimpio = (cui || "").replace(/[^0-9]/g, "");

  const proveedor = proveedores.find(p =>
    String(p.cui || "").replace(/[^0-9]/g, "") === cuiLimpio &&
    String(p.clave || "").trim() === String(password || "").trim()
  );

  if (!proveedor) return res.status(401).send("CUIT o clave incorrectos");

  // Log de acceso → hoja “Accesos” (tu webhook de siempre)
  if (webhookURL) {
    const postData = JSON.stringify({ nombre: proveedor.nombre, cuit: cuiLimpio });
    const reqGS = https.request(webhookURL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(postData) },
    }, r => r.on("data", () => {}));
    reqGS.on("error", (err) => console.error("❌ Accesos webhook error:", err.message));
    reqGS.write(postData); reqGS.end();
  }

  const entregas = proFru.filter(e => e.ProveedorT === proveedor.nombre);
  const totalKgs = entregas.reduce((suma, e) => suma + (parseFloat(e.KgsD) || 0), 0);

  res.json({
    proveedor: proveedor.nombre,
    org: proveedor.org || "",
    entregas,
    resumen: { totalKgs },
    ultimaActualizacion: lastUpdate.fecha || "Fecha desconocida"
  });
});

/* ========= ESTADO: primero JSON local; si no, consulta a Sheets ========= */
async function estadoDesdeSheets(cuitNum){
  try {
    const resp = await postJSON(GAS_PAUTA_URL, { accion:"aceptacion_pauta", modo:"estado", cuit:cuitNum });
    if (resp && (resp.pauta || resp.pautaorganica)) return resp;
  } catch(e){ console.warn("Sheets estado error:", e?.message || e); }
  return null;
}

app.get("/api/pauta/estado", async (req, res) => {
  const cuit = String(req.query.cuit || "").replace(/[^0-9]/g, "");
  if (!cuit) return res.status(400).json({ error: "CUIT requerido" });

  let arr = safeReadArray(PAUTA_LOG);
  const ultimo = (tipo) => {
    for (let i = arr.length - 1; i >= 0; i--) {
      const r = arr[i];
      if (r.cuit === cuit && r.tipo === tipo) return r;
    }
    return null;
  };
  const pLoc = ultimo("pauta");
  const oLoc = ultimo("pautaorganica");

  // si tenemos algo local, devolvemos; si no, preguntamos a Sheets
  if (pLoc || oLoc) {
    return res.json({
      pauta:         pLoc ? { firmado:true, fechaLocal:pLoc.fechaLocal } : { firmado:false },
      pautaorganica: oLoc ? { firmado:true, fechaLocal:oLoc.fechaLocal } : { firmado:false }
    });
  }

  const s = await estadoDesdeSheets(cuit);
  if (s) return res.json(s);

  // fallback vacío
  res.json({ pauta:{ firmado:false }, pautaorganica:{ firmado:false } });
});

/* ========= REGISTRAR FIRMA (JSON + Google Sheet) ========= */
app.post("/api/pauta/firmar", async (req, res) => {
  try {
    const { tipo, acepta, responsable, cargo, proveedor, cuit, test } = req.body || {};

    if (!["pauta","pautaorganica"].includes(tipo)) return res.status(400).json({ error: "tipo inválido" });
    if (!acepta) return res.status(400).json({ error: "Debe aceptar la pauta" });

    const cuitNum = String(cuit || "").replace(/[^0-9]/g, "");
    if (!cuitNum || !proveedor || !responsable || !cargo) {
      return res.status(400).json({ error: "Datos incompletos" });
    }

    const ahora = new Date();
    const fechaLocal = ahora.toLocaleString("es-AR", {
      day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit"
    }).replace(",", "");

    // 1) Log local (real o test)
    const file = test ? PAUTA_LOG_TEST : PAUTA_LOG;
    const arr = safeReadArray(file);
    arr.push({ tipo, proveedor, cuit: cuitNum, responsable, cargo, fechaLocal, iso: ahora.toISOString() });
    safeWriteArray(file, arr);

    // 2) Google Sheet (omitido si test=1)
    if (!test && GAS_PAUTA_URL) {
      const payload = {
        accion: "aceptacion_pauta",
        modo: "registrar",
        timestamp: ahora.toISOString(),
        cuit: cuitNum,
        // enviamos ambas claves por compatibilidad
        nombre: proveedor,
        proveedor: proveedor,
        tipo: (tipo === "pautaorganica") ? "pauta_organica" : "pauta",
        responsable,
        cargo,
        userAgent: req.headers["user-agent"] || ""
      };
      const gs = await postJSON(GAS_PAUTA_URL, payload);
      if (!gs?.ok) console.warn("❌ Apps Script (registrar) error:", gs);
    }

    res.json({ ok: true, fechaLocal });
  } catch (e) {
    console.error("Error /api/pauta/firmar:", e);
    res.status(500).json({ error: "Error interno" });
  }
});

/* ========= BORRAR ÚLTIMA FIRMA (para pruebas) ========= */
app.post("/api/pauta/borrar", async (req, res) => {
  try {
    const { cuit, tipo, test } = req.body || {};
    const cuitNum = String(cuit || "").replace(/[^0-9]/g, "");
    if (!cuitNum || !["pauta","pautaorganica"].includes(tipo)) {
      return res.status(400).json({ ok:false, error:"Parámetros inválidos" });
    }

    // 1) JSON local: eliminar última coincidencia
    const file = test ? PAUTA_LOG_TEST : PAUTA_LOG;
    const arr = safeReadArray(file);
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i].cuit === cuitNum && arr[i].tipo === tipo) { arr.splice(i, 1); break; }
    }
    safeWriteArray(file, arr);

    // 2) Google Sheet (omitido si test=1)
    if (!test && GAS_PAUTA_URL) {
      const payload = { accion:"aceptacion_pauta", modo:"borrar",
        cuit: cuitNum, tipo: (tipo === "pautaorganica") ? "pauta_organica" : "pauta" };
      const gs = await postJSON(GAS_PAUTA_URL, payload);
      if (!gs?.ok) console.warn("❌ Apps Script (borrar) error:", gs);
    }

    res.json({ ok:true });
  } catch (e) {
    console.error("Error /api/pauta/borrar:", e);
    res.status(500).json({ ok:false, error:"Error interno" });
  }
});

/* ========= START ========= */
app.listen(PORT, () => {
  console.log(`🚀 Servidor funcionando en http://localhost:${PORT}`);
});
