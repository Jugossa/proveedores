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

/**
 * WEBHOOKS
 *  - webhookAccesosURL: hoja donde registrás los ACCESOS.
 *  - webhookPautaURL:  hoja "Log de accesos / AceptacionesPauta".
 */

// ✅ Webhook ACCESOS (el que ya tenías andando)
const webhookAccesosURL =
  "https://script.google.com/macros/s/AKfycbw8lL7K2t2co2Opujs8Z95fA61hKsU0ddGV6NKV2iFx8338Fq_PbB5vr_C7UbVlGYOj/exec";

// ✅ Webhook PAUTA (TU WebApp actual, acceso público)
const webhookPautaURL =
  "https://script.google.com/macros/s/AKfycbyNukewSLy5upQqKBlejTBv_CV5m-0AEzfF8O4B618MRajhIc_W1mAEoMDQEzpusp0u/exec";

// ---- Carga genérica de JSON ----
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

console.log("✔ Datos cargados correctamente");

app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos de /data (incluye /data/pauta/pauta.pdf)
app.use("/data", express.static(baseDir));

// -------------------------------
//     RUTAS PÚBLICAS
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

  const proveedor = proveedores.find(
    (p) =>
      (p.cui || "").replace(/[^0-9]/g, "") === cuiLimpio &&
      String(p.clave || "").trim() === String(password || "").trim()
  );

  if (!proveedor) {
    return res.status(401).send("CUIT o clave incorrectos");
  }

  // Enviar log de ACCESO a Google Sheets
  if (webhookAccesosURL) {
    const postData = JSON.stringify({
      tipoRegistro: "acceso",
      nombre: proveedor.nombre,
      cuit: cuiLimpio,
    });

    const reqGS = https.request(
      webhookAccesosURL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
        },
      },
      (resGS) => {
        console.log(`🟢 ACCESO -> Google respondió: ${resGS.statusCode}`);
        resGS.on("data", () => {});
      }
    );

    reqGS.on("error", (err) => {
      console.error("❌ Error al enviar webhook de ACCESO:", err.message);
    });

    reqGS.write(postData);
    reqGS.end();
  }

  // Si es usuario administrador (CUIT 692018), ir al panel de ingresos
  if (cuiLimpio === "692018") {
    return res.json({
      tipo: "admin",
      proveedor: proveedor.nombre || "ADMINISTRADOR",
      ultimaActualizacion: lastUpdate.fecha || "Fecha desconocida",
    });
  }

  // Filtrar entregas
  const entregas = proFru.filter((e) => e.ProveedorT === proveedor.nombre);
  const totalKgs = entregas.reduce(
    (s, e) => s + (parseFloat(e.KgsD) || 0),
    0
  );

  // 👇 NUEVO: devolvemos también el flag org para que el front
  // sepa si debe mostrar el botón de "Pauta orgánica".
  res.json({
    proveedor: proveedor.nombre,
    entregas,
    resumen: { totalKgs },
    ultimaActualizacion: lastUpdate.fecha || "Fecha desconocida",
    org: proveedor.org || ""   // "x" si es orgánico, vacío si no
  });
});

// -------------------------------
//     RUTAS PAUTAS
// -------------------------------

// Estado de pauta (placeholder, por ahora siempre permite firmar)
app.get("/api/pauta/estado", (req, res) => {
  const cuit = (req.query.cuit || "").replace(/[^0-9]/g, "");
  if (!cuit) return res.json({ ok: false, error: "cuit_requerido" });

  // Más adelante se puede consultar la hoja AceptacionesPauta.
  return res.json({ ok: true, pauta: { firmado: false } });
});

// Registrar firma de pauta
app.post("/api/pauta/firmar", (req, res) => {
  const { tipo, acepta, responsable, cargo, proveedor, cuit } = req.body;
  const cuitLimpio = (cuit || "").replace(/[^0-9]/g, "");

  if (!acepta || !proveedor || !cuitLimpio || !responsable || !cargo) {
    return res
      .status(400)
      .json({ ok: false, error: "datos_incompletos" });
  }

  if (!webhookPautaURL) {
    return res
      .status(500)
      .json({ ok: false, error: "webhook_no_configurado" });
  }

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

  // 👇 Normalizamos el tipo de pauta:
  // - default: "pauta"
  // - si el "tipo" contiene "organ" => "pauta organica"
  const tipoPauta =
    typeof tipo === "string" &&
    tipo.toLowerCase().includes("organ")
      ? "pauta organica"
      : "pauta";

  const payload = {
    proveedor,
    cuit: cuitLimpio,
    responsable,
    cargo,
    accion: "aceptacion_pauta",
    modo: "registrar",
    tipoPauta,          // ← se envía ya normalizado
    fechaLocal,
  };

  const postData = JSON.stringify(payload);

  console.log("➡ Enviando PAUTA a Apps Script:", payload);

  const reqGS = https.request(
    webhookPautaURL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    },
    (resGS) => {
      let body = "";
      resGS.on("data", (chunk) => (body += chunk.toString()));
      resGS.on("end", () => {
        console.log("⬅ Respuesta Apps Script PAUTA:", resGS.statusCode, body);
        try {
          const json = JSON.parse(body);
          if (json && typeof json === "object") {
            return res.json(json);
          }
        } catch (e) {
          console.warn(
            "⚠ No se pudo parsear respuesta de Apps Script:",
            e.message
          );
        }
        return res.json({ ok: true, fechaLocal });
      });
    }
  );

  reqGS.on("error", (err) => {
    console.error("❌ Error al enviar PAUTA:", err.message);
    return res
      .status(500)
      .json({ ok: false, error: "error_webhook", detail: err.message });
  });

  reqGS.write(postData);
  reqGS.end();
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
