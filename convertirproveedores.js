const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const baseDir = path.join(__dirname, "data");
const excelPath = path.join(baseDir, "proveedores.xlsx");
const jsonPath = path.join(baseDir, "proveedores.json");

// Leer el archivo Excel
const workbook = XLSX.readFile(excelPath);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet);

// Transformar columnas
const proveedores = data.map(row => ({
  cui: String(row.cui || row.CUIT || row.Cuil || "").trim(),
  nombre: String(row.nombre || row.Nombre || "").trim(),
  clave: String(row.clave || row.password || "").trim()
}));

// Guardar como JSON
fs.writeFileSync(jsonPath, JSON.stringify(proveedores, null, 2), "utf8");

console.log("✅ Archivo proveedores.json generado con", proveedores.length, "proveedores.");
