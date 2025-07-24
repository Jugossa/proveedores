const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

// Leer el archivo Excel
const workbook = xlsx.readFile(path.join(__dirname, 'data', 'ProFru.xlsx'));
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

// Convertir la hoja a JSON
let data = xlsx.utils.sheet_to_json(worksheet);

// Función para convertir número de Excel a fecha
function excelDateToJSDate(serial) {
  const excelEpoch = new Date(Date.UTC(1899, 11, 30));
  const days = Math.floor(serial);
  const milliseconds = days * 24 * 60 * 60 * 1000;
  const date = new Date(excelEpoch.getTime() + milliseconds);
  return date;
}

// Función para formatear a dd/mm/yyyy
function formatDateToDDMMYYYY(date) {
  const d = date.getUTCDate().toString().padStart(2, '0');
  const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const y = date.getUTCFullYear();
  return `${d}/${m}/${y}`;
}

// Aplicar conversión de fecha
data = data.map(row => {
  if (typeof row.Fecha === 'number') {
    const jsDate = excelDateToJSDate(row.Fecha);
    row.Fecha = formatDateToDDMMYYYY(jsDate);
  }
  return row;
});

// Guardar como JSON
fs.writeFileSync(
  path.join(__dirname, 'data', 'ProFru.json'),
  JSON.stringify(data, null, 2),
  'utf-8'
);

// Guardar fecha de última actualización
const lastUpdate = {
  fecha: new Date().toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).replace(',', '')
};

fs.writeFileSync(
  path.join(__dirname, 'data', 'lastUpdate.json'),
  JSON.stringify(lastUpdate, null, 2),
  'utf-8'
);

console.log('Conversión completa. Archivos actualizados en /data.');
