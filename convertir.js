const XLSX = require('xlsx');
const fs = require('fs');

// Ruta del Excel origen
const excelPath = "I:/Pagina/proveedores/proveedores.xlsx";

// Ruta de salida
const jsonPath = "I:/Pagina/proveedores/proveedores.json";

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