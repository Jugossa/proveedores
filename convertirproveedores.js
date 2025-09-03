// convertirproveedores.js
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

try {
  // Base: carpeta data bajo el directorio actual (el .bat hace cd a I:\Pagina\proveedores)
  const baseDir = path.resolve(process.cwd(), "data");
  const excelPath = path.join(baseDir, "proveedores.xlsx");
  const jsonPath  = path.join(baseDir, "proveedores.json");

  // --- Validaciones de existencia ---
  if (!fs.existsSync(excelPath)) {
    console.error("❌ No se encuentra el Excel:", excelPath);
    process.exit(1);
  }

  // --- Comparación de fechas ---
  const excelStat = fs.statSync(excelPath);
  const hasJson = fs.existsSync(jsonPath);
  const jsonStat = hasJson ? fs.statSync(jsonPath) : null;

  if (hasJson && excelStat.mtimeMs <= jsonStat.mtimeMs) {
    console.log("⏭️  Sin cambios: el Excel no es más nuevo que el JSON.");
    console.log("📄 Excel :", new Date(excelStat.mtime).toLocaleString());
    console.log("📄 JSON  :", new Date(jsonStat.mtime).toLocaleString());
    process.exit(0); // salir sin error y sin convertir
  }

  // --- Leer Excel y convertir ---
  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet);

  if (!data.length) {
    console.error("❌ El Excel no contiene datos.");
    process.exit(1);
  }

  // Soporte de encabezados "cui" o "cuit", más campo "org"
const proveedores = data.map((row) => ({
  nombre: String(row["nombre"] || "").trim(),
  cui: String(row["cui"] ?? row["cuit"] ?? "").trim(),
  clave: String(row["clave"] || "").trim(),
  org: String(row["org"] || "").trim().toLowerCase()  // "x" si es orgánico
}));


  // Validación mínima
  const vacios = proveedores.filter(p => !p.nombre || !p.cui);
  if (vacios.length) {
    console.warn(`⚠️ ${vacios.length} fila(s) con nombre o CUI/CUIT vacío(s). Se guardará igual.`);
  }

  fs.writeFileSync(jsonPath, JSON.stringify(proveedores, null, 2), "utf8");

  const outStat = fs.statSync(jsonPath);
  console.log("✅ Conversión realizada.");
  console.log("📂 JSON  :", jsonPath);
  console.log("📅 Fecha :", new Date(outStat.mtime).toLocaleString());
  process.exit(0);
} catch (err) {
  console.error("❌ Error en la conversión:", err.message);
  process.exit(1);
}
