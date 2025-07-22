@echo off
echo -------------------------------------
echo 📦 ACTUALIZANDO portal de proveedores
echo -------------------------------------

cd /d C:\Temp\proveedores

echo.
echo ✅ Haciendo commit...
git add .
git commit -m "Actualización automática" || echo (sin cambios nuevos)

echo.
echo 🚀 Haciendo push a GitHub...
git push origin main

echo.
echo 🌐 Solicitando redeploy en Render...
curl -X POST https://api.render.com/deploy/srv-xxxxxxxxxxxxxxxxxxxxxxxx?key=yyyyyyyyyyyyyyyyyyyyyyyy

echo.
pause