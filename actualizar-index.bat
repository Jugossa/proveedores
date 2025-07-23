@echo off
echo === Subiendo index.html actualizado ===
git add public/index.html
git commit -m "Actualizar index.html"
git push

echo === Forzando deploy en Render ===
curl -X POST https://api.render.com/v1/services/srv-d1volnnfte5s7392flp0/deploys ^
 -H "Authorization: Bearer rnd_WaePIC6ZELL8oyJYzybT4Ns8X89u" ^
 -H "Accept: application/json" ^
 -d ""

echo.
echo ✅ index.html actualizado local y en Render.
pause