const express = require("express");
const fs = require("fs");
const path = require("path");
const https = require("https");

const app = express();
const PORT = process.env.PORT || 3000;

// Detección robusta del entorno Render
const isRender = process.env.RENDER || process.env.RENDER_EXTERNAL_URL || process.env.PORT;
const baseDir = isRender
  ? path.join(__dirname, "data")
  : path.join("C:", "Temp", "proveedores", "data");

let proveedores = [];
let proFru = [];
let lastUpdate = { fecha: "Desconocida" };
let webhookURL = "https://script.google.com/macros/s/AKfycbw8lL7K2t2co2Opujs8Z95fA61hKsU0ddGV6NKV2iFx8338Fq_PbB5vr_C7UbVlGYOj/exec";

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

// Endpoint de login
app.post("/login", (req, res) => {
  const { cui, password } = req.body;
  const cuiLimpio = cui.replace(/[^0-9]/g, "");

  const proveedor = proveedores.find(p =>
    p.cui.replace(/[^0-9]/g, "") === cuiLimpio &&
    p.clave.trim() === password.trim()
  );

  if (!proveedor) {
    return res.status(401).send("CUIT o clave incorrectos");
  }

  // Enviar log de acceso a Google Sheets
  if (webhookURL) {
    const postData = JSON.stringify({
      nombre: proveedor.nombre,
      cuit: cuiLimpio
    });

    console.log("🔄 Enviando al webhook:", postData);
    console.log("📤 Webhook URL:", webhookURL);

    const reqGS = https.request(webhookURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    }, resGS => {
      console.log(`🟢 Google respondió: ${resGS.statusCode}`);
      resGS.on("data", chunk => {
        console.log("🟢 Respuesta completa:", chunk.toString());
      });
    });

    reqGS.on("error", (err) => {
      console.error("❌ Error al conectar con Google Sheets:", err.message);
    });

    reqGS.write(postData);
    reqGS.end();
  } else {
    console.warn("⚠ Webhook no disponible, no se registró el acceso.");
  }

  const entregas = proFru.filter(e => e.ProveedorT === proveedor.nombre);
  const totalKgs = entregas.reduce((suma, e) => suma + (parseFloat(e.KgsD) || 0), 0);

  res.json({
    proveedor: proveedor.nombre,
    entregas,
    resumen: { totalKgs },
    ultimaActualizacion: lastUpdate.fecha || "Fecha desconocida"
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor funcionando en http://localhost:${PORT}`);
});
