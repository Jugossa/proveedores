const express = require("express");
const fs = require("fs");
const path = require("path");
const https = require("https");

const app = express();
const PORT = process.env.PORT || 3000;

// Detectar entorno Render
const isRender =
  process.env.RENDER ||
  process.env.RENDER_EXTERNAL_URL ||
  process.env.PORT;

// Rutas locales / producción
const baseDir = isRender
  ? path.join(__dirname, "data")
  : path.join("I:", "Pagina", "proveedores", "data");

// Variables en memoria
let proveedores = [];
let proFru = [];
let ingresosDiarios = [];
let proCert = [];
let lastUpdate = { fecha: "Desconocida" };

// Webhook oficial (Apps Script)
let webhookURL =
  "https://script.google.com/macros/s/AKfycbyNukewSLy5upQqKBlejTBv_CV5m-0AEzfF8O4B618MRajhIc_W1mAEoMDQEzpusp0u/exec";

// ---------------- CARGA JSON ----------------

function cargarJSON(nombre, ref) {
  const full = path.join(baseDir, nombre);
  try {
    const raw = fs.readFileSync(full, "utf8");
    ref.data = JSON.parse(raw);
    console.log(
      `✔ Cargado ${nombre} (${
        Array.isArray(ref.data) ? ref.data.length : "objeto"
      } registros)`
    );
  } catch (err) {
    console.error(`❌ Error al leer ${nombre}:`, err.message);
    ref.data = Array.isArray(ref.data) ? [] : {};
  }
}

const refProveedores = { data: proveedores };
const refProFru = { data: proFru };
const refIngresos = { data: ingresosDiarios };
const refProCert = { data: proCert };
const refLastUpdate = { data: lastUpdate };

cargarJSON("proveedores.json", refProveedores);
cargarJSON("profru.json", refProFru);
cargarJSON("ingresosDiarios.json", refIngresos);
cargarJSON("ProCert.json", refProCert);
cargarJSON("lastUpdate.json", refLastUpdate);

// reasignar
proveedores = refProveedores.data;
proFru = refProFru.data;
ingresosDiarios = refIngresos.data;
proCert = refProCert.data;
lastUpdate = refLastUpdate.data || lastUpdate;

console.log("✔ Webhook cargado OK");

// Middleware
app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir PDFs desde /data
app.use("/data", express.static(baseDir));

// ---------------- RUTAS PÚBLICAS ----------------

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/index-celu.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index-celu.html"));
});

// ---------------- LOGIN ----------------

app.post("/login", (req, res) => {
  const { cui, password } = req.body;
  const cuiLimpio = (cui || "").replace(/[^0-9]/g, "");

  const proveedor = proveedores.find(
    (p) =>
      (p.cui || "").replace(/[^0-9]/g, "") === cuiLimpio &&
      String(p.clave || "").trim() === String(password || "").trim()
  );

  if (!proveedor) return res.status(401).send("CUIT o clave incorrectos");

  // Registrar acceso en Google Sheets
  if (webhookURL) {
    const postData = JSON.stringify({
      tipoRegistro: "acceso",
      nombre: proveedor.nombre,
      cuit: cuiLimpio,
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
        console.log(`🟢 Google respondió acceso: ${resGS.statusCode}`);
      }
    );

    reqGS.on("error", (err) => {
      console.log("❌ Error webhook acceso:", err.message);
    });

    reqGS.write(postData);
    reqGS.end();
  }

  // ADMIN
  if (cuiLimpio === "692018") {
    return res.json({
      tipo: "admin",
      proveedor: proveedor.nombre || "ADMINISTRADOR",
      ultimaActualizacion: lastUpdate.fecha || "Fecha desconocida",
    });
  }

  // Filtrar entregas por proveedor
  const entregas = proFru.filter((e) => e.ProveedorT === proveedor.nombre);
  const totalKgs = entregas.reduce(
    (s, e) => s + (parseFloat(e.KgsD) || 0),
    0
  );

  res.json({
    proveedor: proveedor.nombre,
    entregas,
    resumen: { totalKgs },
    ultimaActualizacion: lastUpdate.fecha || "Fecha desconocida",
    org: proveedor.org || ""   // <─ IMPORTANTE PARA BOTONES PAUTA
  });
});

// ---------------- FIRMA DE PAUTA ----------------
//
// ESTA ES LA PARTE QUE CORRIGIMOS
//

app.post("/api/pauta/firmar", (req, res) => {
  const { tipoPauta, acepta, responsable, cargo, proveedor, cuit } = req.body;

  const cuitLimpio = (cuit || "").replace(/[^0-9]/g, "");
  if (!acepta || !proveedor || !cuitLimpio)
    return res.status(400).json({ ok: false, error: "datos_incompletos" });

  if (!webhookURL)
    return res.status(500).json({ ok: false, error: "webhook_no_configurado" });

  // NORMALIZAR tipo de pauta para Apps Script
  let tipoFinal = "pauta";
  if (tipoPauta && tipoPauta.toLowerCase().includes("organ"))
    tipoFinal = "pauta organica";

  console.log("➡ Enviando pauta:", tipoFinal);

  const postData = JSON.stringify({
    accion: "aceptacion_pauta",
    modo: "registrar",
    proveedor,
    cuit: cuitLimpio,
    responsable,
    cargo,
    tipoPauta: tipoFinal
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
      let data = "";
      resGS.on("data", (c) => (data += c));
      resGS.on("end", () => {
        console.log("⬅ Respuesta Google Pauta:", data);
        return res.json({ ok: true });
      });
    }
  );

  reqGS.on("error", (err) => {
    console.log("❌ Error webhook pauta:", err.message);
    return res.status(500).json({ ok: false, error: "error_webhook" });
  });

  reqGS.write(postData);
  reqGS.end();
});

// ---------------- ADMIN ----------------

app.get("/admin/ingresos", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin", "ingresos.html"));
});

app.get("/api/admin/ingresos-diarios", (req, res) => {
  res.json(ingresosDiarios || []);
});

app.get("/api/admin/procert", (req, res) => {
  res.json(proCert || []);
});

// ---------------- INICIO SERVIDOR ----------------

app.listen(PORT, () =>
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`)
);
