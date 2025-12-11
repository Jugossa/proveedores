// ====================== DEPENDENCIAS ======================
const express = require("express");
const app = express();
const https = require("https");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

// ====================== CONFIG =========================
require("dotenv").config();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

// URL del WebApp de Apps Script
const webhookPautaURL =
  "https://script.google.com/macros/s/AKfycbyNukewSLy5upQqKBlejTBv_CV5m-0AEzfF8O4B618MRajhIc_W1mAEoMDQEzpusp0u/exec";

// ====================== FRONTEND =========================
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ====================== API: PAUTA =========================
//
//  Esta ruta recibe desde index.html:
//
//  {
//    proveedor: "KLEPPE SA",
//    cuit: "30511608615",
//    responsable: "marcos",
//    cargo: "encargado",
//    tipo: "Pauta"               <-- VIENE DEL BOTÓN
//  }
//
//  Y lo reenvía como está al Google Sheet.
//

app.post("/api/pauta/firmar", (req, res) => {
  const { proveedor, cuit, responsable, cargo, tipo } = req.body;

  if (!proveedor || !cuit || !responsable || !cargo || !tipo) {
    return res.status(400).json({ ok: false, error: "datos_incompletos" });
  }

  // CUIT limpiado por seguridad
  const cuitLimpio = (cuit || "").replace(/[^0-9]/g, "");

  // El botón decide el texto FINAL:
  const tipoPauta = String(tipo).trim();

  // Payload enviado al Google Sheet
  const payload = {
    proveedor,
    cuit: cuitLimpio,
    responsable,
    cargo,
    tipoPauta,   // <<-- TEXTO DEL BOTÓN SIN MODIFICAR
    accion: "aceptacion_pauta",
    modo: "registrar",
    fechaLocal: new Date().toLocaleString("es-AR")
  };

  const postData = JSON.stringify(payload);

  console.log("➡ Enviando a Google Sheets:", payload);

  // Llamada HTTPS al WebApp
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
        console.log("⬅ Respuesta Google Sheets:", body);
        try {
          return res.json(JSON.parse(body));
        } catch (e) {
          return res.status(500).json({
            ok: false,
            error: "error_parseando_respuesta",
          });
        }
      });
    }
  );

  reqGS.on("error", (err) => {
    console.error("❌ Error HTTPS Apps Script:", err);
    return res.status(500).json({ ok: false, error: "error_webhook" });
  });

  reqGS.write(postData);
  reqGS.end();
});

// ====================== SERVER =========================
app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto " + PORT);
});
