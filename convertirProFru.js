const XLSX = require("xlsx");
const fs = require("fs");

function excelDate(dateStr) {
  const [day, month, year] = dateStr.split("/");
  const date = new Date(`${year}-${month}-${day}`);
  return 25569 + (date - new Date("1970-01-01")) / 86400000;
}

const wb = XLSX.readFile("data/ProFru.xlsx");
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws);

const output = data.map(row => ({
  "Ide Jugos": row["Ide Jugos"],
  "Nro Jugos": row["Nro Jugos"],
  "Fecha": typeof row["Fecha"] === "number" ? row["Fecha"] : excelDate(row["Fecha"]),
  "Remito": row["Remito"],
  "CantBins": row["CantBins"],
  "ProveedorT": row["ProveedorT"],
  "Origen": row["Origen"],
  "Especie": row["Especie"],
  "NomVariedad": row["NomVariedad"],
  "KgsD": row["KgsD"],
  "Certificado": row["Certificado"],
  "pagado": false,
  "dt1": row["dt1"] || 0,
  "kgs": row["kgs"] || 0
}));

fs.writeFileSync("data/profru.json", JSON.stringify(output, null, 2));

const lastUpdate = {
  fecha: new Date().toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).replace(",", "")
};
fs.writeFileSync("data/lastUpdate.json", JSON.stringify(lastUpdate, null, 2));

console.log("✅ Archivo generado correctamente.");

