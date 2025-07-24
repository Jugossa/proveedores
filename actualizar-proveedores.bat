@echo off
echo === Paso 1: Ejecutando conversión desde Excel ===
node convertirProveedores.js

echo === Paso 2: Subiendo a GitHub ===
git add data/proveedores.json
git commit -m "Actualizar proveedores desde Excel"
git push

echo === Paso 3: Desplegando en Render desde secrets.txt ===
for /f "tokens=1,2 delims==" %%A in (secrets.txt) do (
    if "%%A"=="RENDER_TOKEN" set TOKEN=%%B
    if "%%A"=="RENDER_SERVICE" set SERVICE=%%B
)
curl -X POST https://api.render.com/v1/services/%SERVICE%/deploys ^
 -H "Authorization: Bearer %TOKEN%" ^
 -H "Accept: application/json" ^
 -d ""

echo.
echo ✅ Proveedores actualizados en GitHub y Render.
pause
