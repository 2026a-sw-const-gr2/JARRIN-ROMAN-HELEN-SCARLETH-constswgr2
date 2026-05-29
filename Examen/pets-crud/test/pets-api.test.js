//sirve para mantenimiento perfectivo, porque mejoras la calidad del sistema con pruebas automáticas.

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.API_KEY = process.env.API_KEY || 'fis-epn-2026';

const { app } = require('../server');

const API_KEY = process.env.API_KEY;

let server;
let baseUrl;

test.before(() => {
  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(() => {
  server.close();
});

test('seguridad: rechaza GET /pets sin API-Key', async () => {
  const response = await fetch(`${baseUrl}/pets`);

  assert.equal(response.status, 401);
});

test('seguridad: permite GET /pets con API-Key correcta', async () => {
  const response = await fetch(`${baseUrl}/pets`, {
    headers: {
      'X-FIS-EPN-KEY': API_KEY,
    },
  });

  assert.equal(response.status, 200);
});

test('validación API: rechaza crear mascota incompleta', async () => {
  const response = await fetch(`${baseUrl}/pets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-FIS-EPN-KEY': API_KEY,
    },
    body: JSON.stringify({
      name: '',
      species: '',
      owner: '',
    }),
  });

  assert.equal(response.status, 400);

  const body = await response.json();
  assert.ok(body.error.includes('name es obligatorio'));
});

test('CRUD API: crea y elimina una mascota válida', async () => {
  const createResponse = await fetch(`${baseUrl}/pets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-FIS-EPN-KEY': API_KEY,
    },
    body: JSON.stringify({
      name: 'Firulais Test',
      species: 'perro',
      breed: 'Mestizo',
      age: 2,
      owner: 'Usuario Prueba',
      phone: '0999999999',
      status: 'activo',
      description: 'Mascota creada desde prueba automatizada',
    }),
  });

  assert.equal(createResponse.status, 201);

  const createdPet = await createResponse.json();

  assert.ok(createdPet.id);
  assert.equal(createdPet.name, 'Firulais Test');

  const deleteResponse = await fetch(`${baseUrl}/pets/${createdPet.id}`, {
    method: 'DELETE',
    headers: {
      'X-FIS-EPN-KEY': API_KEY,
    },
  });

  assert.equal(deleteResponse.status, 200);
});