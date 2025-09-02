const express = require("express");
const fs = require("fs");
const path = require("path");
const https = require("https");

const app = express();
const PORT = process.env.PORT || 3000;

const isRender = process.env.RENDER || process.env.RENDER_EXTERNAL_URL || process.env.PORT;
const baseDir = isRender ? path.join(__dirname, "data") : path.join("C:", "Temp", "proveedores", "data");

let proveedores = [];
let proFru = [];
let lastUpdate = { fecha: "Desconocida" };
let webhookURL = "https://script.google.com/macros/s/AKfycbw8lL7K2t2co2Opujs8Z95fA61hKsU0ddGV6NKV2iFx8338Fq_PbB5vr_C7UbVlGYOj/exec";

try { proveedores = JSON.parse(fs.readFileSync(path.join(baseDir, "proveedores.json"), "utf8")); } catch {}
try { proFru = JSON.parse(fs.readFileSync(path.join(baseDir, "profru.json"), "utf8")); } catch {}
try { lastUpdate = JSON.parse(fs.readFileSync(path.join(baseDir, "lastUpdate.json"), "utf8")); } catch {}

app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ENDPOINTS DE PAUTA (simplificado)
app.use("/data", express.static(path.join(__dirname, "data")));
const PAUTA_LOG_REAL = path.join(__dirname, "data", "pautaLog.json");
if (!fs.existsSync(PAUTA_LOG_REAL)) fs.writeFileSync(PAUTA_LOG_REAL, "[]");

app.get("/api/pauta/estado", (req,res)=>{ res.json({ pauta:{firmado:false}, pautaorganica:{firmado:false} }); });

app.post("/api/pauta/firmar", (req,res)=>{ res.json({ok:true, fechaLocal:new Date().toLocaleString("es-AR")}); });

app.listen(PORT, ()=>console.log("Servidor en http://localhost:"+PORT));
