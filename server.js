const express = require("express");
const fs = require("fs");
const path = require("path");
const https = require("https");

const app = express();
const PORT = process.env.PORT || 3000;

// Detección de entorno Render
const isRender =
  process.env.RENDER ||
  process.env.RENDER_EXTERNAL_URL ||
  process.env.PORT;

// Ruta base a data
const baseDir = isRender
  ? path.join(__dirname, "data")
  : path.join("I:", "Pagina", "proveedores", "data");

// Datos del sistema
let proveedores = [];
let proFru = [];
let ingresosDiarios = [];
let proCert = [];
let lastUpdate = { fecha: "Desconocida" };

// Webhook Apps Script (pautas)
let webhookURL =
  "https://script.google.com/macros/s/AKfycbyNukewSLy5upQqKBlejTBv_CV5m-0AEzfF8O4B618MRajhIc_W1mAEoMDQEzpusp0u/exec";

// ------------------------------
//   FUNCIONES CARGA JSON
// ------------------------------
function cargarJSON(nombre, ref) {
  const full = path.join(baseDir, nombre);
  try {
    const raw = fs.readFileSync(full, "utf8");
    ref.data = JSON.parse(raw);
    console.log(`✔ Cargado ${nombre}`);
  } catch (err) {
    console.error(`❌ Error leyendo ${nombre}:`, err.message);
    ref.data = Array.isArray(ref.data) ? [] : {};
  }
}

const refProveedores = { data: proveedores };
const refProFru = { data: proFru };
const refIngresos = { data: ingresosDiarios };
const refProCert = { data: proCert };
const refLastUpdate = { data: lastUpdate };

// Cargar
cargarJSON("proveedores.json", refProveedores);
cargarJSON("profru.json", refProFru);
cargarJSON("ingresosDiarios.json", refIngresos);
cargarJSON("ProCert.json", refProCert);
cargarJSON("lastUpdate.json", refLastUpdate);

// reasignamos
proveedores = refProveedores.data;
proFru = refProFru.data;
ingresosDiarios = refIngresos.data;
proCert = refProCert.data;
lastUpdate = refLastUpdate.data;

// ------------------------------
// EXPRESS SETUP
// ------------------------------
app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir /data (incluye /data/pauta/pauta.pdf)
app.use("/data", express.static(baseDir));

// ------------------------------
//   RUTA PRINCIPAL
// ------------------------------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/index-celu.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index-celu.html"));
});

// ------------------------------
//   LOGIN PROVEEDORES
// ------------------------------
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

  // log a Google Sheets (Accesos)
  if (webhookURL) {
    const postData = JSON.stringify({
      tipoRegistro: "acceso",
      nombre: proveedor.nombre,
      cuit: cuiLimpio,
      fecha: new Date().toISOString(),
    });

    const reqGS = https.request(
      webhookURL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
        },
      },
      (resGS) => {
        console.log(`🟢 ACCESO -> Google respondió: ${resGS.statusCode}`);
      }
    );

    reqGS.on("error", (err) => {
      console.error("❌ Error enviando log de acceso:", err.message);
    });

    reqGS.write(postData);
    reqGS.end();
  }

  // Si es admin
  if (cuiLimpio === "692018") {
    return res.json({
      tipo: "admin",
      proveedor: proveedor.nombre,
      ultimaActualizacion: lastUpdate.fecha,
    });
  }

  // entregas filtradas
  const entregas = proFru.filter((e) => e.ProveedorT === proveedor.nombre);
  const totalKgs = entregas.reduce((s, e) => s + (parseFloat(e.KgsD) || 0), 0);

  res.json({
    proveedor: proveedor.nombre,
    entregas,
    resumen: { totalKgs },
    ultimaActualizacion: lastUpdate.fecha,
  });
});

// --------------------------------------------
//     FIRMAS DE PAUTA (CORREGIDO ACÁ)
// --------------------------------------------
app.post("/api/pauta/firmar", (req, res) => {
  const { proveedor, cuit, responsable, cargo, tipoPauta } = req.body;
  const cuitLimpio = (cuit || "").replace(/[^0-9]/g, "");

  if (!proveedor || !cuitLimpio || !responsable || !cargo) {
    return res.status(400).json({ ok: false, error: "datos_incompletos" });
  }

  if (!webhookURL) {
    return res
      .status(500)
      .json({ ok: false, error: "webhook_no_configurado" });
  }

  // Marca EXACTA que Apps Script necesita
  const tipoFinal =
    tipoPauta === "pauta" || tipoPauta === "pauta organica"
      ? tipoPauta
      : "pauta";

  const postData = JSON.stringify({
    proveedor,
    cuit: cuitLimpio,
    responsable,
    cargo,
    tipoPauta: tipoFinal,
  });

  console.log("➡ Enviando PAUTA a Apps Script:", postData);

  const reqGS = https.request(
    webhookURL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    },
    (resGS) => {
      console.log(`⬅ Respuesta Apps Script PAUTA: ${resGS.statusCode}`);

      let data = "";
      resGS.on("data", (chunk) => (data += chunk));
      resGS.on("end", () => {
        console.log("Respuesta Google:", data);
        return res.json({ ok: true, tipoPauta: tipoFinal });
      });
    }
  );

  reqGS.on("error", (err) => {
    console.error("❌ Error enviando pauta:", err.message);
    return res
      .status(500)
      .json({ ok: false, error: "error_webhook", detalle: err.message });
  });

  reqGS.write(postData);
  reqGS.end();
});

// ------------------------------
//   ADMIN: ingresos diarios & ProCert
// ------------------------------
app.get("/admin/ingresos", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin", "ingresos.html"));
});

app.get("/api/admin/ingresos-diarios", (req, res) => {
  res.json(ingresosDiarios || []);
});

app.get("/api/admin/procert", (req, res) => {
  res.json(proCert || []);
});

// ------------------------------
//   START SERVER
// ------------------------------
app.listen(PORT, () => {
  console.log(`🚀 Servidor funcionando en http://localhost:${PORT}`);
});
