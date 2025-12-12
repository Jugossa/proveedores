const express = require("express");
const fs = require("fs");
const path = require("path");
const https = require("https");

const app = express();
const PORT = process.env.PORT || 3000;

// Detectar si estamos en Render
const isRender =
  process.env.RENDER ||
  process.env.RENDER_EXTERNAL_URL ||
  process.env.PORT;

// Ruta base de datos
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
 * WEBHOOKS:
 *  - ACCESOS: log de accesos
 *  - PAUTA:   hoja AceptacionesPauta
 */
const webhookAccesosURL =
  "https://script.google.com/macros/s/AKfycbw8lL7K2t2co2Opujs8Z95fA61hKsU0ddGV6NKV2iFx8338Fq_PbB5vr_C7UbVlGYOj/exec";

const webhookPautaURL =
  "https://script.google.com/macros/s/AKfycbyNukewSLy5upQqKBlejTBv_CV5m-0AEzfF8O4B618MRajhIc_W1mAEoMDQEzpusp0u/exec";

// ---------- Carga genérica de JSON ----------
function cargarJSON(nombre, ref) {
  const fullPath = path.join(baseDir, nombre);
  try {
    const raw = fs.readFileSync(fullPath, "utf8");
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

proveedores = refProveedores.data;
proFru = refProFru.data;
ingresosDiarios = refIngresos.data;
proCert = refProCert.data;
lastUpdate = refLastUpdate.data || lastUpdate;

console.log("✔ Datos cargados correctamente");

// Middleware
app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos de /data (incluye PDFs de pauta)
app.use("/data", express.static(baseDir));

// ---------------------------------
//              RUTAS
// ---------------------------------

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/index-celu.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index-celu.html"));
});

// ---------- LOGIN PROVEEDORES ----------
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

  // Log de acceso a Google Sheets
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

  // Admin (CUIT 692018)
  if (cuiLimpio === "692018") {
    return res.json({
      tipo: "admin",
      proveedor: proveedor.nombre || "ADMINISTRADOR",
      org: proveedor.org || proveedor.Org || "",
      ultimaActualizacion: lastUpdate.fecha || "Fecha desconocida",
    });
  }

  // Entregas del proveedor
  const entregas = proFru.filter((e) => e.ProveedorT === proveedor.nombre);
  const totalKgs = entregas.reduce(
    (suma, e) => suma + (parseFloat(e.KgsD) || 0),
    0
  );

  res.json({
    proveedor: proveedor.nombre,
    org: proveedor.org || proveedor.Org || "",
    entregas,
    resumen: { totalKgs },
    ultimaActualizacion: lastUpdate.fecha || "Fecha desconocida",
  });
});

// ---------- PAUTAS ----------

// Estado pauta (por ahora: siempre permite firmar)
app.get("/api/pauta/estado", (req, res) => {
  const cuit = (req.query.cuit || "").replace(/[^0-9]/g, "");
  if (!cuit) return res.json({ ok: false, error: "cuit_requerido" });

  // Más adelante se puede leer hoja AceptacionesPauta.
  return res.json({ ok: true, pauta: { firmado: false } });
});

// Registrar firma de pauta / pauta orgánica
app.post("/api/pauta/firmar", (req, res) => {
  const { tipo, tipoPauta: tipoPautaForm, acepta, responsable, cargo, proveedor, cuit } = req.body;
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

  // Normalizar tipo de pauta: priorizamos lo que viene del formulario
  let tipoPauta =
    typeof tipoPautaForm === "string" && tipoPautaForm.trim()
      ? tipoPautaForm.trim()
      : null;

  if (!tipoPauta) {
    // Si no vino desde el formulario, inferimos según el botón usado
    tipoPauta =
      typeof tipo === "string" && tipo.toLowerCase().includes("organ")
        ? "pauta organica"
        : "pauta";
  }

  const payload = {
    proveedor,
    cuit: cuitLimpio,
    responsable,
    cargo,
    accion: "aceptacion_pauta",
    modo: "registrar",
    // Dos claves para que Apps Script pueda usar cualquiera
    tipoPauta,            // minúsculas
    TipoPauta: tipoPauta, // coincide con encabezado "TipoPauta"
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

// ---------- ADMIN ----------

app.get("/admin/ingresos", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin", "ingresos.html"));
});

app.get("/api/admin/ingresos-diarios", (req, res) => {
  res.json(ingresosDiarios || []);
});

app.get("/api/admin/procert", (req, res) => {
  res.json(proCert || []);
});

// ---------- ARRANQUE SERVIDOR ----------
app.listen(PORT, () => {
  console.log(`🚀 Servidor funcionando en http://localhost:${PORT}`);
});
