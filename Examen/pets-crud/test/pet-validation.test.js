const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeSpecies,
  normalizeStatus,
  validatePet,
} = require('../server');

test('validación: rechaza mascota sin nombre, especie y dueño', () => {
  const errors = validatePet({});

  assert.ok(errors.includes('name es obligatorio'));
  assert.ok(errors.includes('species es obligatorio'));
  assert.ok(errors.includes('owner es obligatorio'));
});

test('validación: acepta una mascota correcta', () => {
  const errors = validatePet({
    name: 'Max',
    species: 'perro',
    owner: 'Gabriela',
    age: 3,
    status: 'activo',
  });

  assert.deepEqual(errors, []);
});

test('estado: normaliza estados desconocidos a activo', () => {
  assert.equal(normalizeStatus('desconocido'), 'activo');
});

test('especie: normaliza especies desconocidas a otro', () => {
  assert.equal(normalizeSpecies('dragon'), 'otro');
});