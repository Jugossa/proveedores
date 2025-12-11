const express = require("express");
const fs = require("fs");
const path = require("path");
const https = require("https");

const app = express();
const PORT = process.env.PORT || 3000;

const isRender =
  process.env.RENDER ||
  process.env.RENDER_EXTERNAL_URL ||
  process.env.PORT;

// Ruta local o Render
const baseDir = isRender
  ? path.join(__dirname, "data")
  : path.join("I:", "Pagina", "proveedores", "data");

// Datos en memoria
let proveedores = [];
let proFru = [];
let ingresosDiarios = [];
let proCert = [];
let lastUpdate = { fecha: "Desconocida" };

// URL del Apps Script que registra pautas
let webhookPauta =
  "https://script.google.com/macros/s/AKfycbyNukewSLy5upQqKBlejTBv_CV5m-0AEzfF8O4B618MRajhIc_W1mAEoMDQEzpusp0u/exec";

// FORMATO FECHA LOCAL ARG
function fechaLocalArgentina() {
  return new Date()
    .toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
    .replace(",", "");
}

function cargarJSON(nombre, ref) {
  const full = path.join(baseDir, nombre);
  try {
    const raw = fs.readFileSync(full, "utf8");
    ref.data = JSON.parse(raw);
  } catch (err) {
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

proveedores = refProveedores.data;
proFru = refProFru.data;
ingresosDiarios = refIngresos.data;
proCert = refProCert.data;
lastUpdate = refLastUpdate.data || lastUpdate;

app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/data", express.static(baseDir));

// ================================
// LOGIN
// ================================
app.post("/login", (req, res) => {
  const { cui, password } = req.body;
  const cuiLimpio = (cui || "").replace(/[^0-9]/g, "");

  const proveedor = proveedores.find(
    (p) =>
      (p.cui || "").replace(/[^0-9]/g, "") === cuiLimpio &&
      String(p.clave || "").trim() === String(password || "").trim()
  );

  if (!proveedor) return res.status(401).send("CUIT o clave incorrectos");

  // Si es admin
  if (cuiLimpio === "692018") {
    return res.json({
      tipo: "admin",
      proveedor: proveedor.nombre || "ADMINISTRADOR",
      ultimaActualizacion: lastUpdate.fecha,
    });
  }

  // Filtrar entregas
  const entregas = proFru.filter((e) => e.ProveedorT === proveedor.nombre);
  const totalKgs = entregas.reduce(
    (s, e) => s + (parseFloat(e.KgsD) || 0),
    0
  );

  res.json({
    proveedor: proveedor.nombre,
    entregas,
    resumen: { totalKgs },
    ultimaActualizacion: lastUpdate.fecha,
    org: proveedor.org || "",
  });
});

// =============================================
// FIRMA DE PAUTA (AQUÍ ESTABA EL PROBLEMA!!!)
// =============================================
app.post("/api/pauta/firmar", (req, res) => {
  const { proveedor, cuit, responsable, cargo, tipoPauta } = req.body;

  if (!proveedor || !cuit || !responsable || !cargo) {
    return res.status(400).json({ ok: false, error: "datos_incompletos" });
  }

  const fechaLocal = fechaLocalArgentina();

  // ESTE ES EL FORMATO CORRECTO QUE APPS SCRIPT ESPERA
  const payload = JSON.stringify({
    proveedor,
    cuit,
    responsable,
    cargo,
    tipoPauta: tipoPauta || "pauta",
    fechaLocal,
  });

  const reqGS = https.request(
    webhookPauta,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    },
    (gsRes) => {
      gsRes.on("data", () => {});
      gsRes.on("end", () => {
        return res.json({ ok: true, fechaLocal });
      });
    }
  );

  reqGS.on("error", (err) => {
    return res.status(500).json({ ok: false, error: "webhook_error" });
  });

  reqGS.write(payload);
  reqGS.end();
});

// ====================
app.listen(PORT, () =>
  console.log(`Servidor OK -> http://localhost:${PORT}`)
);
