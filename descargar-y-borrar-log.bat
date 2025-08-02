@echo off
echo === Descargando log.txt desde Render ===

curl -s https://proveedores-y0xr.onrender.com/log.txt -o C:\Temp\proveedores\public\log.txt

echo ✅ Log guardado en C:\Temp\proveedores\public\log.txt

echo.
echo === Borrando log.txt en el servidor (Render) ===

curl -s https://proveedores-y0xr.onrender.com/borrar-log > nul

echo ✅ log.txt remoto fue borrado correctamente.
pause
