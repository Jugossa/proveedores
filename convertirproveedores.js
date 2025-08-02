const XLSX = require("xlsx");
const fs = require("fs");

// Rutas absolutas en la PC de Naty
const excelPath = "C:/Temp/proveedores/data/proveedores.xlsx";
const jsonPath = "C:/Temp/proveedores/data/proveedores.json";

// Leer el archivo Excel
const workbook = XLSX.readFile(excelPath);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet);

if (!data.length) {
  console.error("❌ El Excel no contiene datos.");
  process.exit(1);
}

const proveedores = data.map(row => ({
  nombre: String(row["nombre"] || "").trim(),
  cui: String(row["cui"] || "").trim(),
  clave: String(row["clave"] || "").trim()
}));

try {
  fs.writeFileSync(jsonPath, JSON.stringify(proveedores, null, 2), "utf8");
  if (fs.existsSync(jsonPath)) {
    const stats = fs.statSync(jsonPath);
    console.log(`✅ Archivo creado correctamente en: ${jsonPath}`);
    console.log(`📅 Fecha de modificación: ${stats.mtime}`);
  } else {
    throw new Error("El archivo no se creó.");
  }
} catch (err) {
  console.error("❌ Error al guardar el archivo:", err.message);
  process.exit(1);
}
