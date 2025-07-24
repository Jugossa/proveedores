@echo off
cd /d C:\Temp\proveedores

echo === 🟣 Abriendo Access para generar ProFru.xlsx...
start "" "\\jugoso0100\sistemas\Prg\LogisticaMP\LiqP.accdb"

echo Esperando a que Access genere el archivo ProFru.xlsx...
timeout /t 10 >nul

echo === 🔄 Ejecutando conversión de ProFru.xlsx a JSON...
node convertirProFru.js

echo === 📤 Subiendo cambios a GitHub...
git add .
git commit -m "Actualización completa de ProFru"
git push

echo === 🚀 Forzando deploy en Render desde secrets.txt ===
for /f "tokens=1,2 delims==" %%A in (secrets.txt) do (
    if "%%A"=="RENDER_TOKEN" set TOKEN=%%B
    if "%%A"=="RENDER_SERVICE" set SERVICE=%%B
)
curl -X POST https://api.render.com/v1/services/%SERVICE%/deploys ^
 -H "Authorization: Bearer %TOKEN%" ^
 -H "Accept: application/json" ^
 -d ""

echo 🌐 Abriendo portal en el navegador...
start https://proveedores-y0xr.onrender.com/

echo ✅ Todo listo: Access, conversión, subida y deploy completados.
pause
se