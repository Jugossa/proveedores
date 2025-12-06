#!/usr/bin/env node
/**
 * convertirIngresosDiarios.js
 * Convierte data/IngresosDiarios.xlsx → data/ingresosDiarios.json
 */

const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const baseDir = path.join(__dirname, "data");
const excelPath = path.join(baseDir, "IngresosDiarios.xlsx");
const jsonPath  = path.join(baseDir, "ingresosDiarios.json");

if (!fs.existsSync(excelPath)) {
  console.error("❌ No existe IngresosDiarios.xlsx");
  process.exit(1);
}

console.log("📄 Leyendo IngresosDiarios.xlsx...");
const wb = XLSX.readFile(excelPath);
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, { defval: "" });

console.log("💾 Guardando ingresosDiarios.json");
fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), "utf8");

console.log("✅ Listo.");
