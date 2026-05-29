# Documentación API - Pets CRUD

## Descripción general

La API `pets-crud` permite gestionar mascotas mediante operaciones CRUD: crear, listar, consultar, actualizar, eliminar y obtener estadísticas básicas.

## Seguridad

Todos los endpoints `/pets` requieren el siguiente header:

```http
X-FIS-EPN-KEY: fis-epn-2026