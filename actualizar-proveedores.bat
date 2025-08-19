for /f "delims=" %%L in ('node convertirproveedores.js') do (
  echo %%L
  echo %%L | find "Sin cambios" >nul
  if not errorlevel 1 set SKIP=1
)

if "%SKIP%"=="1" (
  echo === ✅ Nada para subir. Saltando Git y deploy...
  goto :END
)

echo === 📤 Subiendo cambios a GitHub...
git add data\proveedores.json
git commit -m "Actualización proveedores desde PC de Marcos"
git push --force

echo === 🚀 Forzando deploy en Render...
rem (tu bloque de curl)

:END
echo 🌐 Abriendo portal en el navegador...
start https://proveedores-y0xr.onrender.com/
