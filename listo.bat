@echo off
cd /d C:\Temp\proveedores

echo === 📤 Subiendo cambios a GitHub...

git add .
git commit -m "Actualización automática"
git push

echo === 🚀 Forzando deploy en Render...

curl -X POST https://api.render.com/v1/services/srv-d1volnnfte5s7392flp0/deploys ^
 -H "Authorization: Bearer rnd_WaePIC6ZELL8oyJYzybT4Ns8X89u" ^
 -H "Accept: application/json" ^
 -d ""

echo ✅ ¡Listo! GitHub actualizado y Render desplegando...
pause
