@echo off
echo === Subiendo server.js actualizado ===
git add server.js
git commit -m "Actualizar server.js para soporte en Render"
git push

echo === Forzando deploy en Render ===
curl -X POST https://api.render.com/v1/services/srv-d1volnnfte5s7392flp0/deploys ^
 -H "Authorization: Bearer rnd_WaePIC6ZELL8oyJYzybT4Ns8X89u" ^
 -H "Accept: application/json" ^
 -d ""

echo.
echo ✅ server.js actualizado y deploy en Render lanzado.
pause