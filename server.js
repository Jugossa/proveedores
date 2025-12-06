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

// ⚠ Ruta local corregida → I:\Pagina\proveedores\data
const baseDir = isRender
  ? path.join(__dirname, "data")
  : path.join("I:", "Pagina", "proveedores", "data");

// Datos en memoria
let proveedores = [];
let proFru = [];
let ingresosDiarios = [];
let proCert = [];
let lastUpdate = { fecha: "Desconocida" };

// Webhook de Google Sheets
let webhookURL = "https://script.google.com/macros/s/AKfycbw8lL7K2t2co2Opujs8Z95fA61hKsU0ddGV6NKV2iFx8338Fq_PbB5vr_C7UbVlGYOj/exec";

// ---- Carga genérica de JSON ----
function cargarJSON(nombre, ref) {
  const full = path.join(baseDir, nombre);
  try {
    const raw = fs.readFileSync(full, "utf8");
    ref.data = JSON.parse(raw);
    console.log(`✔ Cargado ${nombre} (${Array.isArray(ref.data) ? ref.data.length : "objeto"} registros)`);
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

// Cargar JSON
cargarJSON("proveedores.json", refProveedores);
cargarJSON("profru.json", refProFru);
cargarJSON("ingresosDiarios.json", refIngresos);
cargarJSON("ProCert.json", refProCert);
cargarJSON("lastUpdate.json", refLastUpdate);

// reasignar variables
proveedores = refProveedores.data;
proFru = refProFru.data;
ingresosDiarios = refIngresos.data;
proCert = refProCert.data;
lastUpdate = refLastUpdate.data || lastUpdate;

console.log("✔ Webhook cargado correctamente");

app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// -------------------------------
//     RUTAS PUBLICAS
// -------------------------------

// Página principal
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Página móvil
app.get("/index-celu.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index-celu.html"));
});

// LOGIN proveedores
app.post("/login", (req, res) => {
  const { cui, password } = req.body;
  const cuiLimpio = (cui || "").replace(/[^0-9]/g, "");

  const proveedor = proveedores.find(p =>
    (p.cui || "").replace(/[^0-9]/g, "") === cuiLimpio &&
    String(p.clave || "").trim() === String(password || "").trim()
  );

  if (!proveedor) {
    return res.status(401).send("CUIT o clave incorrectos");
  }

  // Enviar log a Google Sheets
  if (webhookURL) {
    const postData = JSON.stringify({
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
        console.log(`🟢 Google respondió: ${resGS.statusCode}`);
        resGS.on("data", (chunk) => console.log("🟢 Respuesta:", chunk.toString()));
      }
    );

    reqGS.on("error", (err) => {
      console.error("❌ Error al enviar webhook:", err.message);
    });

    reqGS.write(postData);
    reqGS.end();
  }

  // 👇 Usuario administrador: redirigir al panel de ingresos diarios
  if (cuiLimpio === "692018") {
    return res.json({
      tipo: "admin",
      proveedor: proveedor.nombre,
    });
  }

  // Filtrar entregas para proveedores normales
  const entregas = proFru.filter(e => e.ProveedorT === proveedor.nombre);
  const totalKgs = entregas.reduce((s, e) => s + (parseFloat(e.KgsD) || 0), 0);

  res.json({
    proveedor: proveedor.nombre,
    entregas,
    resumen: { totalKgs },
    ultimaActualizacion: lastUpdate.fecha || "Fecha desconocida",
  });
});

// -------------------------------
//     RUTAS ADMINISTRADOR
// -------------------------------

// Página admin
app.get("/admin/ingresos", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin", "ingresos.html"));
});

// API ingresos diarios
app.get("/api/admin/ingresos-diarios", (req, res) => {
  res.json(ingresosDiarios || []);
});

// API ProCert (orgánicos)
app.get("/api/admin/procert", (req, res) => {
  res.json(proCert || []);
});

// -------------------------------
//      INICIO DEL SERVIDOR
// -------------------------------

app.listen(PORT, () => {
  console.log(`🚀 Servidor funcionando en http://localhost:${PORT}`);
});
