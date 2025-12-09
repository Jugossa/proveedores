const express = require("express");
const fs = require("fs");
const path = require("path");
const https = require("https");

const app = express();
const PORT = process.env.PORT || 3000;

// Directorio base de los JSON
const baseDir = path.join(__dirname, "data");

// Cargar proveedores
const proveedoresPath = path.join(baseDir, "proveedores.json");
let proveedores = [];
if (fs.existsSync(proveedoresPath)) {
  proveedores = JSON.parse(fs.readFileSync(proveedoresPath, "utf8"));
}

// Cargar ProFru
const proFruPath = path.join(baseDir, "profru.json");
let proFru = [];
if (fs.existsSync(proFruPath)) {
  proFru = JSON.parse(fs.readFileSync(proFruPath, "utf8"));
}

// Cargar lastUpdate
const lastUpdatePath = path.join(baseDir, "lastUpdate.json");
let lastUpdate = { fecha: "" };
if (fs.existsSync(lastUpdatePath)) {
  lastUpdate = JSON.parse(fs.readFileSync(lastUpdatePath, "utf8"));
}

// Webhook para accesos
let webhookURL = "";
try {
  const webhookFile = path.join(baseDir, "webho0k.txt");
  if (fs.existsSync(webhookFile)) {
    webhookURL = fs.readFileSync(webhookFile, "utf8").trim();
  }
} catch (e) {
  console.error("Error leyendo webhook:", e);
}

app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// SERVIR /data (JSON)
app.use("/data", express.static(baseDir));

// SERVIR /data/pauta (PDFs) ← AGREGADO
app.use("/data/pauta", express.static(path.join(baseDir, "pauta")));

// ---------------- LOGIN -----------------
app.post("/login", (req, res) => {
  const { cui, password } = req.body;

  if (!cui || !password) {
    return res.status(400).json({ error: "faltan_datos" });
  }

  const cuiLimpio = cui.replace(/[^0-9]/g, "");
  const proveedor = proveedores.find(
    (p) => p.cuit.replace(/[^0-9]/g, "") === cuiLimpio
  );

  if (!proveedor || proveedor.clave !== password) {
    return res.status(401).json({ error: "credenciales_invalidas" });
  }

  // Registrar acceso en Google Sheets
  if (webhookURL) {
    const payload = JSON.stringify({
      nombre: proveedor.nombre,
      cuit: cuiLimpio,
    });

    const reqGS = https.request(
      webhookURL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      () => {}
    );

    reqGS.on("error", (err) => {
      console.error("Error enviando log:", err);
    });

    reqGS.write(payload);
    reqGS.end();
  }

  // ADMINISTRADOR 692018 → Redirigir
  if (cuiLimpio === "692018") {
    return res.json({
      tipo: "admin",
      proveedor: "ADMINISTRADOR",
      ultimaActualizacion: lastUpdate.fecha || "",
    });
  }

  // Filtrar entregas del proveedor
  const entregas = proFru.filter(
    (e) => (e.ProveedorT || "").toUpperCase() === proveedor.nombre.toUpperCase()
  );

  return res.json({
    proveedor: proveedor.nombre,
    entregas,
    ultimaActualizacion: lastUpdate.fecha || "",
    org: proveedor.org || "",
    certificado: proveedor.certificado || null,
  });
});

// ------------------ Pautas: Estado -------------------
app.get("/api/pauta/estado", (req, res) => {
  const cuit = (req.query.cuit || "").replace(/[^0-9]/g, "");
  if (!cuit) return res.json({});
  return res.json({});
});

// ------------------ Pautas: Registrar firma -------------------
app.post("/api/pauta/firmar", (req, res) => {
  const { tipo, acepta, responsable, cargo, proveedor, cuit } = req.body;

  const cuitLimpio = (cuit || "").replace(/[^0-9]/g, "");
  if (!acepta || !proveedor || !cuitLimpio)
    return res.status(400).json({ ok: false, error: "datos_incompletos" });

  if (!webhookURL)
    return res.status(500).json({ ok: false, error: "webhook_no_configurado" });

  const ahora = new Date();
  const fechaLocal = ahora
    .toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
    .replace(",", "");

  const payload = JSON.stringify({
    tipoRegistro: "pauta",
    tipoPauta: tipo || "pauta",
    proveedor,
    cuit: cuitLimpio,
    responsable,
    cargo,
    acepta: true,
    fechaLocal,
  });

  const reqGS = https.request(
    webhookURL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    },
    (resp) => {
      resp.on("data", () => {});
      resp.on("end", () => {
        return res.json({ ok: true, fechaLocal });
      });
    }
  );

  reqGS.on("error", (err) => {
    console.error("Error firmando pauta:", err);
    return res.status(500).json({ ok: false, error: "error_webhook" });
  });

  reqGS.write(payload);
  reqGS.end();
});

// ------------------ ADMIN: INGRESOS -------------------
app.get("/admin/ingresos", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin", "ingresos.html"));
});

// API para ingresos desde JSON
app.get("/api/admin/ingresos-diarios", (req, res) => {
  const file = path.join(baseDir, "ingresosDiarios.json");
  if (!fs.existsSync(file)) return res.json([]);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  res.json(data);
});

// ---------- Certificados ----------
app.get("/api/admin/procert", (req, res) => {
  const file = path.join(baseDir, "ProCert.json");
  if (!fs.existsSync(file)) return res.json([]);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  res.json(data);
});

app.listen(PORT, () =>
  console.log("Servidor iniciado en puerto " + PORT)
);
