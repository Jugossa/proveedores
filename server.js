const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Detectar entorno (local o Render)
const baseDir = process.env.RENDER === "true"
  ? path.join(__dirname, "data")
  : path.join("C:", "Temp", "proveedores", "data");

let proveedores = [];
let proFru = [];
let lastUpdate = { fecha: "Desconocida" };

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
