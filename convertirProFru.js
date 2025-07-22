const XLSX = require('xlsx');
const fs = require('fs');

// Ruta del Excel origen
const excelPath = "I:/Pagina/proveedores/ProFru.xlsx";

// Ruta de salida
const jsonPath = "I:/Pagina/proveedores/ProFru.json";

// Leer el archivo Excel
const workbook = XLSX.readFile(excelPath);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet);

// Transformar columnas esperadas
const entregas = data.map(row => ({
  "Nro Jugos": String(row["Nro Jugos"] || "").trim(),
  "Fecha": row.Fecha,
  "Remito": String(row.Remito || "").trim(),
  "CantBins": Number(row.CantBins || 0),
  "ProveedorT": String(row.ProveedorT || "").trim(),
  "Origen": String(row.Origen || "").trim(),
  "Especie": String(row.Especie || "").trim(),
  "NomVariedad": String(row.NomVariedad || "").trim(),
  "KgsD": Number(row.KgsD || 0),
  "Certificado": String(row.Certificado || "").trim(),
  "pagado": String(row.pagado || "").toLowerCase().trim() === "si"
}));

// Guardar como JSON
fs.writeFileSync(jsonPath, JSON.stringify(entregas, null, 2), "utf8");

console.log("✅ Archivo ProFru.json generado con", entregas.length, "entregas.");