@echo off
echo === Paso 1: Ejecutando conversión desde Excel ===
node convertirProveedores.js

echo === Paso 2: Subiendo a GitHub ===
git add data/proveedores.json
git commit -m "Actualizar proveedores desde Excel"
git push

echo === Paso 3: Desplegando en Render ===
curl -X POST https://api.render.com/v1/services/srv-d1volnnfte5s7392flp0/deploys ^
 -H "Authorization: Bearer rnd_WaePIC6ZELL8oyJYzybT4Ns8X89u" ^
 -H "Accept: application/json" ^
 -d ""

echo.
echo ✅ Proveedores actualizados en GitHub y Render.
pause