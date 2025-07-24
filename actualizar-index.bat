@echo off
title Actualizar index.html y desplegar en Render
setlocal enabledelayedexpansion

echo === 🔁 Cargando credenciales de secrets.txt ===

set "secretsFile=C:\Temp\proveedores\secrets.txt"
if not exist "%secretsFile%" (
    echo ❌ No se encontró el archivo C:\Temp\proveedores\secrets.txt
    pause
    exit /b
)

for /f "usebackq tokens=1,2 delims==" %%a in ("%secretsFile%") do (
    set "clave=%%a"
    set "valor=%%b"
    if defined clave (
        set "!clave!=!valor!"
    )
)

if not defined RENDER_TOKEN (
    echo ❌ No se pudo cargar RENDER_TOKEN desde secrets.txt
    pause
    exit /b
)
if not defined RENDER_SERVICE (
    echo ❌ No se pudo cargar RENDER_SERVICE desde secrets.txt
    pause
    exit /b
)

echo === ✅ Credenciales cargadas correctamente ===

cd /d C:\Temp\proveedores

echo === 📝 Agregando index.html al commit ===
git add public/index.html

echo === 💬 Haciendo commit ===
git commit -m "Actualizar index.html"

echo === 🚀 Haciendo push a GitHub ===
git push origin main

echo === ☁️ Lanzando deploy en Render... ===
curl -X POST https://api.render.com/deploy/srv-%RENDER_SERVICE%?key=%RENDER_TOKEN%"

echo === 🟢 Todo listo: index actualizado y desplegado ===
pause
