#!/usr/bin/env node
/** convertirProFruLiq.js */

const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const baseDir = path.join(__dirname, "data");
const excelPath = path.join(baseDir, "ProFruLiq.xlsx");
const jsonPath  = path.join(baseDir, "profruLiq.json");

if (!fs.existsSync(excelPath)) {
  console.error("❌ No se encontró ProFruLiq.xlsx");
  process.exit(1);
}

console.log("📄 Leyendo ProFruLiq.xlsx...");
const wb = XLSX.readFile(excelPath);
const ws = wb.Sheets[wb.SheetNames[0]];
let data = XLSX.utils.sheet_to_json(ws, { defval: "" });

console.log("💾 Guardando profruLiq.json...");
fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), "utf8");

console.log("✅ Listo: profruLiq.json generado.");
