const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Ruta dinámica para local vs Render
const baseDir = process.env.RENDER === "true"
  ? path.join(__dirname, "data")
  : path.join("C:", "Temp", "proveedores", "data");

// Cargar archivos JSON correctamente
const proveedores = JSON.parse(fs.readFileSync(path.join(baseDir, "proveedores.json"), "utf8"));
const proFru = JSON.parse(fs.readFileSync(path.join(baseDir, "profru.json"), "utf8"));
const lastUpdate = JSON.parse(fs.readFileSync(path.join(baseDir, "lastUpdate.json"), "utf8"));

// Middleware
app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Página principal
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Ruta de login
app.post("/login", (req, res) => {
  const { cui, password } = req.body;
  const proveedor = proveedores.find(p => p.cuit === cui && p.clave === password);

  if (!proveedor) {
    return res.status(401).send("CUIT o clave incorrectos");
  }

  const entregas = proFru.filter(e => e.ProveedorT === proveedor.nombre);

  res.json({
    proveedor: proveedor.nombre,
    entregas,
    resumen: {
      totalKgs: entregas.reduce((suma, e) => suma + (parseFloat(e.KgsD) || 0), 0)
    },
    ultimaActualizacion: lastUpdate.fecha || "Desconocida"
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor funcionando en http://localhost:${PORT}`);
});