const express = require("express");
const fs = require("fs");
const path = require("path");
const https = require("https");

const app = express();
const PORT = process.env.PORT || 3000;

// Detecta entorno Render
const isRender = process.env.RENDER || process.env.RENDER_EXTERNAL_URL || process.env.PORT;
const baseDir = isRender
  ? path.join(__dirname, "data")
  : path.join("C:", "Temp", "proveedores", "data");

let proveedores = [];
let proFru = [];
let lastUpdate = { fecha: "Desconocida" };
let webhookURL = "https://script.google.com/macros/s/AKfycbw8lL7K2t2co2Opujs8Z95fA61hKsU0ddGV6NKV2iFx8338Fq_PbB5vr_C7UbVlGYOj/exec";

// === Pauta ===
const pautaDir = path.join(baseDir, "pauta");
const pautaPdfPath = path.join(pautaDir, "Pauta.pdf");
const pautaJsonPath = path.join(pautaDir, "pauta_aceptada.json");

// Cargar archivos
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

app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Página principal
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Página móvil
app.get("/index-celu.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index-celu.html"));
});

// Login
app.post("/login", (req, res) => {
  const { cui, password } = req.body;
  const cuiLimpio = String(cui || "").replace(/[^0-9]/g, "");

  const proveedor = proveedores.find(p =>
    String(p.cui || "").replace(/[^0-9]/g, "") === cuiLimpio &&
    String(p.clave || "").trim() === String(password || "").trim()
  );

  if (!proveedor) {
    return res.status(401).send("CUIT o clave incorrectos");
  }

  // Log de acceso a Google Sheets
  if (webhookURL) {
    const postData = JSON.stringify({ nombre: proveedor.nombre, cuit: cuiLimpio });
    const reqGS = https.request(webhookURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    }, resGS => console.log(`🟢 Google respondió: ${resGS.statusCode}`));
    reqGS.on("error", (err) => console.error("❌ Error webhook Sheets:", err.message));
    reqGS.write(postData);
    reqGS.end();
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

// === Utilidades JSON de firmas de Pauta ===
function loadPautaAceptada() {
  try {
    return fs.existsSync(pautaJsonPath)
      ? JSON.parse(fs.readFileSync(pautaJsonPath, "utf8") || "{}")
      : {};
  } catch {
    return {};
  }
}
function savePautaAceptada(map) {
  try {
    if (!fs.existsSync(pautaDir)) fs.mkdirSync(pautaDir, { recursive: true });
    fs.writeFileSync(pautaJsonPath, JSON.stringify(map, null, 2));
  } catch (e) {
    console.error("❌ No se pudo guardar pauta_aceptada.json:", e.message);
  }
}

// === /pauta (prefill empresa/cuit) ===
app.get("/pauta", (req, res) => {
  const aceptadas = loadPautaAceptada();

  // Prefill desde querystring
  const cuitQS = String(req.query.cuit || "").replace(/[^0-9]/g, "");
  const prov = proveedores.find(p => String(p.cui || "").replace(/[^0-9]/g, "") === cuitQS);
  const empresaPrefill = prov ? prov.nombre : String(req.query.empresa || "");

  const ya = cuitQS ? aceptadas[cuitQS] : null;

  const esc = s => String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");

  res.type("html").send(`<!doctype html>
<meta charset="utf-8"><title>Pauta</title>
<style>
body{font-family:system-ui, Arial;margin:0}
header,footer{padding:12px 16px;background:#f6f6f6}
main{padding:12px 16px}
iframe{width:100%;height:68vh;border:none;border-radius:8px}
.row{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0}
input[type=text]{padding:8px;border:1px solid #ccc;border-radius:8px}
button{padding:10px 16px;border:0;border-radius:10px;box-shadow:0 1px 2px rgba(0,0,0,.1);cursor:pointer}
.ok{color:#0a0}
.disabled{background:#e5e7eb;color:#6b7280;cursor:not-allowed}
.primary{background:#eef2ff}
</style>
<header><b>Pauta de Entrega (NT 504 Rev. 08-25)</b></header>
<main>
  <iframe src="/pauta/pdf" title="Pauta PDF"></iframe>

  ${ya ? `
    <p class="ok">✅ Pauta firmada por <b>${esc(ya.nombre_persona)}</b> (${esc(ya.puesto)}) para <b>${esc(ya.empresa)}</b> (CUIT ${esc(cuitQS)}) el <b>${new Date(ya.fecha).toLocaleString()}</b>.</p>
    <button class="disabled" disabled>Firmar (ya firmado)</button>
  ` : `
    <h3>Confirmación</h3>
    <div class="row">
      <label>Empresa (exacta como figura):
        <input id="inEmpresa" type="text" placeholder="Nombre del proveedor" value="${esc(empresaPrefill)}">
      </label>
      <label>CUIT:
        <input id="inCuit" type="text" placeholder="Solo números" value="${esc(cuitQS)}">
      </label>
    </div>
    <div class="row">
      <label>Nombre y apellido del firmante:
        <input id="inNombre" type="text" placeholder="Nombre y apellido">
      </label>
      <label>Puesto:
        <input id="inPuesto" type="text" placeholder="Ej.: Encargado de campo">
      </label>
    </div>
    <p><label><input id="chOk" type="checkbox"> Declaro que leí y acepto la Pauta.</label></p>
    <button id="btnFirmar" class="primary">Firmar</button>
    <p id="msg"></p>
    <script>
      const msg = document.getElementById('msg');
      document.getElementById('btnFirmar').onclick = async () => {
        msg.textContent = '';
        const empresa = document.getElementById('inEmpresa').value.trim();
        const cuit = (document.getElementById('inCuit').value||'').replace(/[^0-9]/g,'');
        const nombre_persona = document.getElementById('inNombre').value.trim();
        const puesto = document.getElementById('inPuesto').value.trim();
        const ok = document.getElementById('chOk').checked;

        if (!ok) return msg.textContent='Debés aceptar la Pauta.';
        if (!empresa || !cuit || !nombre_persona || !puesto) return msg.textContent='Completá todos los datos.';

        const r = await fetch('/pauta/firmar', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ empresa, cuit, nombre_persona, puesto })
        });
        if (r.ok) location.search = '?cuit=' + encodeURIComponent(cuit);
        else msg.textContent = 'No se pudo firmar (verificá CUIT y empresa).';
      };
    </script>
  `}
</main>
<footer>Jugos S.A</footer>`);
});

// Servir PDF
app.get("/pauta/pdf", (req, res) => {
  if (!fs.existsSync(pautaPdfPath)) return res.status(404).send("Pauta no disponible");
  res.sendFile(pautaPdfPath);
});

// Estado para pintar “check” (usa ?cuit=)
app.get("/pauta/status", (req, res) => {
  const cuit = String(req.query.cuit || "").replace(/[^0-9]/g, "");
  const ya = loadPautaAceptada()[cuit];
  res.json({
    firmado: !!ya,
    fecha: ya?.fecha || null,
    nombre_persona: ya?.nombre_persona || null,
    puesto: ya?.puesto || null,
    empresa: ya?.empresa || null
  });
});

// Registrar firma y loguear en Google Sheets (incluye fecha/hora)
app.post("/pauta/firmar", (req, res) => {
  const { empresa, cuit, nombre_persona, puesto } = req.body || {};
  if (!empresa || !cuit || !nombre_persona || !puesto) {
    return res.status(400).send("Faltan datos");
  }
  const cuiLimpio = String(cuit).replace(/[^0-9]/g, "");
  const prov = proveedores.find(p => String(p.cui || "").replace(/[^0-9]/g, "") === cuiLimpio);
  if (!prov) return res.status(400).send("CUIT no registrado");
  if ((prov.nombre || "").trim() !== empresa.trim()) {
    return res.status(400).send("La empresa no coincide con el CUIT");
  }

  const aceptadas = loadPautaAceptada();
  if (!aceptadas[cuiLimpio]) {
    const registro = {
      empresa: prov.nombre,
      cuit: cuiLimpio,
      nombre_persona,
      puesto,
      fecha: new Date().toISOString(), // <- fecha/hora exacta
      ip: (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").toString(),
      ua: req.headers["user-agent"] || "",
      documento: "NT 504 Rev. 08-25"
    };
    aceptadas[cuiLimpio] = registro;
    savePautaAceptada(aceptadas);

    if (webhookURL) {
      const postData = JSON.stringify({ tipo: "pauta_firmada", ...registro });
      const reqGS = https.request(webhookURL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
        },
      }, resGS => console.log(`🟢 Sheets (pauta_firmada): ${resGS.statusCode}`));
      reqGS.on("error", (err) => console.error("❌ Webhook pauta:", err.message));
      reqGS.write(postData);
      reqGS.end();
    }
  }
  res.sendStatus(204);
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor funcionando en http://localhost:${PORT}`);
});
