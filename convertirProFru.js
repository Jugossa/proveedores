const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, 'data', 'ProFru.xlsx');
const outputFile = path.join(__dirname, 'data', 'ProFru.json');

function excelDateToString(excelDate) {
  const date = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

const workbook = xlsx.readFile(inputFile);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = xlsx.utils.sheet_to_json(sheet);

const formatted = data.map(item => {
  const newItem = { ...item };

  // Corrige la fecha
  if (typeof item.Fecha === 'number') {
    newItem.Fecha = excelDateToString(item.Fecha);
  }

  return newItem;
});

fs.writeFileSync(outputFile, JSON.stringify(formatted, null, 2), 'utf8');
console.log('✅ Archivo convertido y fechas corregidas con formato dd/mm/yyyy');
