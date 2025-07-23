@echo off
echo === Paso 1: Ejecutando conversión desde Excel ===
node convertirProFru.js

echo === Paso 2: Haciendo commit y push a GitHub ===
git add data/ProFru.json data/lastUpdate.json
git commit -m "Actualizar ProFru y lastUpdate desde Excel"
git push

echo === Paso 3: Forzando deploy en Render ===
curl -X POST https://api.render.com/v1/services/srv-d1volnnfte5s7392flp0/deploys ^
 -H "Authorization: Bearer rnd_WaePIC6ZELL8oyJYzybT4Ns8X89u" ^
 -H "Accept: application/json" ^
 -d ""

echo.
echo ✅ Todo listo. Servidor actualizado local y remoto.
pause