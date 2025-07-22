const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ dest: 'uploads/' });
const dataPath = path.join(__dirname, 'data');


// Página principal
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Upload proveedores (opcional)
app.post('/upload-proveedores', upload.single('file'), (req, res) => {
  try {
    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);

    const proveedores = data.map(row => ({
      cui: String(row.cui || row.CUIT || row.Cuil || "").trim(),
      nombre: String(row.nombre || row.Nombre || "").trim(),
      clave: String(row.clave || row.password || "").trim()
    }));

    fs.writeFileSync(path.join(dataPath, 'proveedores.json'), JSON.stringify(proveedores, null, 2), 'utf8');
    res.send({ message: "✅ proveedores.json actualizado." });
  } catch (error) {
    res.status(500).send({ error: "❌ Error procesando proveedores.xlsx" });
  }
});

// Upload entregas (opcional)
app.post('/upload-profru', upload.single('file'), (req, res) => {
  try {
    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);

    const entregas = data.map(row => ({
      "Nro Jugos": String(row["Nro Jugos"] || "").trim(),
      "Fecha": row.Fecha,
      "Remito": String(row.Remito || "").trim(),
      "CantBins": Number(row.CantBins || 0),
      "ProveedorT": String(row.ProveedorT || "").trim(),
      "Origen": String(row.Origen || "").trim(),
      "Especie": String(row.Especie || "").trim(),
      "NomVariedad": String(row.NomVariedad || "").trim(),
      "KgsD": Number(row.KgsD || 0),
      "Certificado": String(row.Certificado || "").trim(),
      "pagado": String(row.pagado || "").toLowerCase().trim() === "si"
    }));

    fs.writeFileSync(path.join(dataPath, 'ProFru.json'), JSON.stringify(entregas, null, 2), 'utf8');
    res.send({ message: "✅ ProFru.json actualizado." });
  } catch (error) {
    res.status(500).send({ error: "❌ Error procesando ProFru.xlsx" });
  }
});

// Login corregido y robusto
app.post("/login", (req, res) => {
  try {
    const { cui, password } = req.body;
    console.log("🧪 Login recibido:", cui, password);

    if (!cui || !password) {
      return res.status(400).send({ error: "Faltan datos de login" });
    }

    const proveedoresPath = path.join(dataPath, "proveedores.json");
    const profruPath = path.join(dataPath, "ProFru.json");

    if (!fs.existsSync(proveedoresPath) || !fs.existsSync(profruPath)) {
      return res.status(500).send({ error: "Faltan archivos de datos" });
    }

    const proveedores = JSON.parse(fs.readFileSync(proveedoresPath, "utf8"));
    console.log("📋 Proveedores cargados:", proveedores.length);

    const cuiNormalizado = cui.replace(/\D/g, '');

    const proveedor = proveedores
      .filter(p => p.cui && p.clave)
      .find(p =>
        p.cui.replace(/\D/g, '') === cuiNormalizado &&
        p.clave === password
      );

    if (!proveedor) {
      console.warn("❌ Login fallido: CUIT o clave incorrectos.");
      return res.status(401).send({ error: "Usuario o contraseña inválidos" });
    }

    console.log("✅ Login OK:", proveedor.nombre);

    const entregas = JSON.parse(fs.readFileSync(profruPath, "utf8"));
    const entregasFiltradas = entregas.filter(e =>
      (e.ProveedorT || "").trim() === proveedor.nombre.trim()
    );

    console.log("📦 Entregas encontradas:", entregasFiltradas.length);
    res.send(entregasFiltradas);
  } catch (err) {
    console.error("❌ Error en /login:", err);
    res.status(500).send({ error: "Error interno" });
  }
});

// Última actualización
app.get("/lastUpdate.json", (req, res) => {
  const updatePath = path.join(dataPath, "lastUpdate.json");
  if (!fs.existsSync(updatePath)) {
    return res.status(404).send("No encontrado");
  }
  res.sendFile(updatePath);
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Servidor funcionando en http://localhost:${PORT}`);
});
