
function formatDate(excelDate) {
    const date = new Date(excelDate);
    if (isNaN(date.getTime())) return "";
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

// Ruta al archivo Excel y carpeta de salida
const baseDir = path.join(__dirname, "data");
const excelPath = path.join(baseDir, "ProFru.xlsx");
const jsonPath = path.join(baseDir, "ProFru.json");
const lastUpdatePath = path.join(baseDir, "lastUpdate.json");

// Función para convertir fecha de Excel a texto
// función antigua eliminada {
  const base = new Date(1899, 11, 30);
  base.setDate(base.getDate() + Math.floor(numero));
  return base.toISOString().split("T")[0]; // yyyy-mm-dd
}

// Leer el archivo Excel
const workbook = XLSX.readFile(excelPath);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet);

// Transformar columnas esperadas
const entregas = data.map(row => ({
  "Nro Jugos": String(row["Nro Jugos"] || "").trim(),
  "Fecha": convertirFechaExcel(row.Fecha),
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

// Actualizar fecha en lastUpdate.json
const now = new Date();
const fecha = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
fs.writeFileSync(lastUpdatePath, JSON.stringify({ fecha }, null, 2), "utf8");

console.log("✅ ProFru.json (con fechas legibles) y lastUpdate.json actualizados en /data");