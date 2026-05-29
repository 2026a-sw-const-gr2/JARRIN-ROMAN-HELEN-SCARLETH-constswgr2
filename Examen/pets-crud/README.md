# Sistema de Gestión de Mascotas — Pets CRUD

Este módulo permite gestionar mascotas mediante operaciones CRUD:

- Crear mascotas
- Listar mascotas
- Consultar una mascota por ID
- Actualizar datos de una mascota
- Eliminar mascotas
- Ver estadísticas básicas

Además, se conecta con `epn-event-manager` para enviar eventos cuando se realiza una acción.

## Tecnologías usadas

- Node.js
- Express
- SQLite
- HTML, CSS y JavaScript
- Axios
- ESLint
- node:test

## Ejecución

Instalar dependencias:

```bash
npm install
npm start

```
check
```bash
npm run check
npm run lint
npm test

```
```bash
npm start
```
    Abrir el navegador
    http://localhost:4002

## Seguridad por API-Key

Los endpoints `/pets` están protegidos mediante el header:

```http
X-FIS-EPN-KEY: fis-epn-2026
