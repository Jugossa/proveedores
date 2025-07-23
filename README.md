# Portal de Proveedores

Este proyecto es un portal web para que los proveedores puedan ver sus entregas, filtradas por CUIT y clave.

## 📂 Estructura

- `server.js`: servidor principal con Express.
- `public/`: archivos estáticos (HTML, CSS, JS frontend).
- `data/`: archivos JSON como `proveedores.json`, `ProFru.json`, etc.
- `scripts/`: scripts auxiliares como `convertir.js`, `convertirProFru.js`.
- `*.bat`: scripts para automatizar la conversión/exportación desde Access o Excel.

## 🚀 Cómo levantar el proyecto

```bash
npm install
node server.js
```

Luego, abrir en el navegador:  
`http://localhost:3000`

## 🔒 Acceso

El sistema valida CUIT y clave desde `proveedores.json`, y muestra solo las entregas del proveedor autenticado (extraídas desde `ProFru.json`).

## 📥 Actualización de datos

Podés ejecutar los scripts `.bat` para actualizar automáticamente los datos desde Access o Excel.

```
actualizar-proveedores.bat
actualizar.bat
```