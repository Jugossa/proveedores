const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

// 📂 Carpeta data relativa al proyecto (funciona en I:\Pagina\proveedores)
const baseDir   = path.join(__dirname, "data");
const excelPath = path.join(baseDir, "proveedores.xlsx");
const jsonPath  = path.join(baseDir, "proveedores.json");

// Leer el archivo Excel
if (!fs.existsSync(excelPath)) {
  console.error("❌ No se encontró el Excel de proveedores en:", excelPath);
  process.exit(1);
}

console.log("📄 Leyendo proveedores.xlsx...");
const workbook = XLSX.readFile(excelPath);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet, { defval: "" });

if (!data.length) {
  console.error("❌ El Excel de proveedores no contiene datos.");
  process.exit(1);
}

// Incluimos también la columna "org" del Excel
const proveedores = data.map(row => ({
  nombre: String(row["nombre"] || "").trim(),
  cui:    String(row["cui"]    || "").trim(),
  clave:  String(row["clave"]  || "").trim(),
  org:    String(row["org"]    || "").trim()   // "x" para orgánicos, "" para los demás
}));

try {
  fs.writeFileSync(jsonPath, JSON.stringify(proveedores, null, 2), "utf8");
  const stats = fs.statSync(jsonPath);
  console.log(`✅ Archivo creado correctamente en: ${jsonPath}`);
  console.log(`📅 Fecha de modificación: ${stats.mtime}`);
} catch (err) {
  console.error("❌ Error al guardar el archivo:", err.message);
  process.exit(1);
}
