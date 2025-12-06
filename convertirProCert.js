#!/usr/bin/env node
/**
 * convertirProCert.js - versión corregida
 * Convierte data/ProCert.xlsx → data/ProCert.json
 */

const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const baseDir = path.join(__dirname, "data");
const excelPath = path.join(baseDir, "ProCert.xlsx");
const jsonPath  = path.join(baseDir, "ProCert.json");

if (!fs.existsSync(excelPath)) {
  console.error("❌ No se encontró ProCert.xlsx en:", excelPath);
  process.exit(1);
}

console.log("📄 Leyendo ProCert.xlsx...");
const wb = XLSX.readFile(excelPath);
const ws = wb.Sheets[wb.SheetNames[0]];
let data = XLSX.utils.sheet_to_json(ws, { defval: "" });

// Opcional: si hay una columna de fecha de vencimiento numérica o texto,
// podríamos normalizarla acá. Por ahora dejamos los datos tal cual.

console.log("💾 Guardando ProCert.json...");
fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), "utf8");

console.log("✅ Listo: ProCert.json generado correctamente.");
