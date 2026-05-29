
// Pet Management System - CRUD API 
// Manteniminento Adaptativo
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

// Logger personalizado para registrar eventos y errores
const logger = require('./utils/logger');

const app = express();

app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const EVENT_MANAGER_URL = process.env.EVENT_MANAGER_URL || 'http://localhost:3000/events';
const EVENT_MANAGER_HEALTH_URL = process.env.EVENT_MANAGER_HEALTH_URL || 'http://localhost:3000/health';

const PORT = process.env.PORT || 4002;

// Clave de API para autenticación simple
const API_KEY = process.env.API_KEY || 'fis-epn-2026';
const API_KEY_HEADER = 'X-FIS-EPN-KEY';


const DB_DIR = path.join(__dirname, 'db');
const DB_PATH = process.env.PETS_DB_PATH || path.join(DB_DIR, 'pets.sqlite');

const allowedSpecies = ['perro', 'gato', 'ave', 'conejo', 'hamster', 'pez', 'otro'];
const allowedStatus = ['activo', 'en_tratamiento', 'adoptado', 'perdido', 'inactivo'];

fs.mkdirSync(DB_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

function migrateDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      species TEXT NOT NULL,
      breed TEXT,
      age INTEGER,
      owner TEXT NOT NULL,
      phone TEXT,
      status TEXT NOT NULL DEFAULT 'activo',
      description TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_pets_species ON pets(species);
    CREATE INDEX IF NOT EXISTS idx_pets_status ON pets(status);
    CREATE INDEX IF NOT EXISTS idx_pets_owner ON pets(owner);
  `);
}

migrateDatabase();

function clean(value) {
  return String(value ?? '').trim();
}

function normalizeSpecies(species) {
  const value = clean(species).toLowerCase();
  return allowedSpecies.includes(value) ? value : 'otro';
}

function normalizeStatus(status) {
  const value = clean(status || 'activo').toLowerCase();
  return allowedStatus.includes(value) ? value : 'activo';
}

function validatePet(data, isUpdate = false) {
  const errors = [];

  const name = clean(data.name);
  const species = clean(data.species).toLowerCase();
  const owner = clean(data.owner);
  const phone = clean(data.phone);
  const breed = clean(data.breed);
  const description = clean(data.description);
  const status = clean(data.status || 'activo').toLowerCase();

  if (!isUpdate || data.name !== undefined) {
    if (!name) errors.push('name es obligatorio');
    if (name.length > 80) errors.push('name no puede superar 80 caracteres');
  }

  if (!isUpdate || data.species !== undefined) {
    if (!species) errors.push('species es obligatorio');
    if (!allowedSpecies.includes(species)) {
      errors.push('species inválida');
    }
  }

  if (!isUpdate || data.owner !== undefined) {
    if (!owner) errors.push('owner es obligatorio');
    if (owner.length > 80) errors.push('owner no puede superar 80 caracteres');
  }

  if (data.age !== undefined && data.age !== '') {
    const age = Number(data.age);
    if (!Number.isInteger(age) || age < 0 || age > 50) {
      errors.push('age debe ser un número entero entre 0 y 50');
    }
  }

  if (data.status !== undefined && !allowedStatus.includes(status)) {
    errors.push('status inválido');
  }


  // Validaciones adicionales para campos opcionales
  if (breed.length > 80) errors.push('breed no puede superar 80 caracteres');
  if (phone.length > 20) errors.push('phone no puede superar 20 caracteres');
  if (description.length > 300) errors.push('description no puede superar 300 caracteres');

  if (/[<>]/.test(name)) errors.push('name no debe contener etiquetas HTML');
  if (/[<>]/.test(owner)) errors.push('owner no debe contener etiquetas HTML');
  if (/[<>]/.test(breed)) errors.push('breed no debe contener etiquetas HTML');
  if (/[<>]/.test(description)) errors.push('description no debe contener etiquetas HTML');

  if (phone && !/^[0-9+\-\s()]{7,20}$/.test(phone)) {
    errors.push('phone tiene un formato inválido');
  }



  return errors;
}

// Middleware para requerir API Key en las solicitudes
function requireApiKey(req, res, next) {
  const receivedKey = req.header(API_KEY_HEADER);

  if (!receivedKey || receivedKey !== API_KEY) {
    logger.warn('API_KEY_INVALID_OR_MISSING', {
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
    });

    return res.status(401).json({
      error: 'API-Key inválida o ausente',
    });
  }

  return next();
}




function nextPetId() {
  const row = db
    .prepare("SELECT id FROM pets WHERE id LIKE 'PET-%' ORDER BY CAST(SUBSTR(id, 5) AS INTEGER) DESC LIMIT 1")
    .get();

  const lastNumber = row ? Number(String(row.id).replace('PET-', '')) : 0;
  return `PET-${String(lastNumber + 1).padStart(4, '0')}`;
}

function mapPet(row) {
  return {
    id: row.id,
    name: row.name,
    species: row.species,
    breed: row.breed || '',
    age: row.age ?? '',
    owner: row.owner,
    phone: row.phone || '',
    status: row.status,
    description: row.description || '',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function findAllPets() {
  return db.prepare('SELECT * FROM pets ORDER BY createdAt DESC').all().map(mapPet);
}

function findPetById(id) {
  const row = db.prepare('SELECT * FROM pets WHERE id = ?').get(clean(id));
  return row ? mapPet(row) : null;
}

function insertPet(body) {
  const now = new Date().toISOString();

  const pet = {
    id: nextPetId(),
    name: clean(body.name),
    species: normalizeSpecies(body.species),
    breed: clean(body.breed),
    age: body.age === '' || body.age === undefined ? null : Number(body.age),
    owner: clean(body.owner),
    phone: clean(body.phone),
    status: normalizeStatus(body.status),
    description: clean(body.description),
    createdAt: now,
    updatedAt: now,
  };

  db.prepare(`
    INSERT INTO pets (
      id, name, species, breed, age, owner, phone, status, description, createdAt, updatedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    pet.id,
    pet.name,
    pet.species,
    pet.breed,
    pet.age,
    pet.owner,
    pet.phone,
    pet.status,
    pet.description,
    pet.createdAt,
    pet.updatedAt,
  );

  return pet;
}

function updatePet(id, body) {
  const current = findPetById(id);
  if (!current) return null;

  const updated = {
    ...current,
    name: body.name !== undefined ? clean(body.name) : current.name,
    species: body.species !== undefined ? normalizeSpecies(body.species) : current.species,
    breed: body.breed !== undefined ? clean(body.breed) : current.breed,
    age: body.age !== undefined ? (body.age === '' ? null : Number(body.age)) : current.age,
    owner: body.owner !== undefined ? clean(body.owner) : current.owner,
    phone: body.phone !== undefined ? clean(body.phone) : current.phone,
    status: body.status !== undefined ? normalizeStatus(body.status) : current.status,
    description: body.description !== undefined ? clean(body.description) : current.description,
    updatedAt: new Date().toISOString(),
  };

  db.prepare(`
    UPDATE pets
    SET name = ?,
        species = ?,
        breed = ?,
        age = ?,
        owner = ?,
        phone = ?,
        status = ?,
        description = ?,
        updatedAt = ?
    WHERE id = ?
  `).run(
    updated.name,
    updated.species,
    updated.breed,
    updated.age,
    updated.owner,
    updated.phone,
    updated.status,
    updated.description,
    updated.updatedAt,
    updated.id,
  );

  return updated;
}

function deletePetById(id) {
  const pet = findPetById(id);
  if (!pet) return null;

  db.prepare('DELETE FROM pets WHERE id = ?').run(clean(id));
  return pet;
}

function getPetStats() {
  const total = db.prepare('SELECT COUNT(*) AS total FROM pets').get().total;
  const active = db.prepare("SELECT COUNT(*) AS total FROM pets WHERE status = 'activo'").get().total;
  const treatment = db.prepare("SELECT COUNT(*) AS total FROM pets WHERE status = 'en_tratamiento'").get().total;
  const lost = db.prepare("SELECT COUNT(*) AS total FROM pets WHERE status = 'perdido'").get().total;

  return { total, active, treatment, lost };
}

/*
async function sendEvent(action, pet) {
  try {
    await axios.post(
      EVENT_MANAGER_URL,
      {
        source: 'PetManagementSystem',
        entity: 'Pet',
        action: action.toUpperCase(),
        title: `[${action.toUpperCase()}] ${pet.name || pet.id || 'Mascota'}`,
        description: `Especie: ${pet.species || 'sistema'} | Dueño: ${pet.owner || 'sistema'} | Estado: ${pet.status || 'consulta'}`,
        payload: pet,
      },
      { timeout: 4000 },
    );

    console.log(`✅ Evento ${action} enviado al Event Manager`);
    return true;
  } catch (error) {
    console.error(`❌ Error enviando evento ${action}:`, error.message);
    return false;
  }
}
  */
// Versión mejorada de sendEvent con logging y manejo de errores más robusto
async function sendEvent(action, pet) {
  try {
    await axios.post(
      EVENT_MANAGER_URL,
      {
        source: 'PetManagementSystem',
        entity: 'Pet',
        action: action.toUpperCase(),
        title: `[${action.toUpperCase()}] ${pet.name || pet.id || 'Mascota'}`,
        description: `Especie: ${pet.species || 'sistema'} | Dueño: ${pet.owner || 'sistema'} | Estado: ${pet.status || 'consulta'}`,
        payload: pet,
      },
      { timeout: 4000 },
    );

    logger.info('EVENT_MANAGER_SENT', {
      action: action.toUpperCase(),
      petId: pet.id,
    });

    return true;
  } catch (error) {
    logger.warn('EVENT_MANAGER_UNAVAILABLE', {
      action: action.toUpperCase(),
      petId: pet.id,
      error: error.message,
    });

    return false;
  }
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', async (req, res) => {
  let hub;

  try {
    const response = await axios.get(EVENT_MANAGER_HEALTH_URL, { timeout: 2500 });
    hub = response.data?.status === 'ok' ? 'connected' : 'error';
  } catch {
    hub = 'offline';
  }

  res.json({
    status: 'ok',
    api: 'pets-crud',
    database: fs.existsSync(DB_PATH) ? 'connected' : 'not-found',
    databasePath: DB_PATH,
    hub,
    timestamp: new Date().toISOString(),
  });
});

// Aplica el middleware de autenticación a todas las rutas de mascotas
app.use('/pets', requireApiKey);



/*
app.get('/pets/stats', (req, res) => {
  res.json(getPetStats());
});
*/
// Versión mejorada de la ruta de estadísticas con logging y manejo de errores
app.get('/pets/stats', (req, res) => {
  try {
    const stats = getPetStats();

    logger.info('PET_STATS_QUERIED', stats);

    return res.json(stats);
  } catch (error) {
    logger.error('PET_STATS_ERROR', {
      error: error.message,
    });

    return res.status(500).json({
      error: 'Error interno al obtener estadísticas',
    });
  }
});

/*
app.get('/pets', async (req, res) => {
  const pets = findAllPets();

  await sendEvent('QUERY', {
    id: 'ALL',
    name: 'Consulta general de mascotas',
    species: 'system',
    owner: 'system',
    status: 'query',
    total: pets.length,
  });

  return res.json(pets);
});
**/
// Versión mejorada de la ruta GET /pets con logging y manejo de errores más robusto
app.get('/pets', async (req, res) => {
  try {
    const pets = findAllPets();

    await sendEvent('QUERY', {
      id: 'ALL',
      name: 'Consulta general de mascotas',
      species: 'system',
      owner: 'system',
      status: 'query',
      total: pets.length,
    });

    logger.info('PETS_LISTED', {
      total: pets.length,
    });

    return res.json(pets);
  } catch (error) {
    logger.error('PETS_LIST_ERROR', {
      error: error.message,
    });

    return res.status(500).json({
      error: 'Error interno al listar mascotas',
    });
  }
});





/*
app.get('/pets/:id', async (req, res) => {
  const pet = findPetById(req.params.id);

  if (!pet) {
    return res.status(404).json({ error: 'Mascota no encontrada' });
  }

  await sendEvent('QUERY', pet);
  return res.json(pet);
});
*/

// Versión mejorada de la ruta GET /pets/:id con logging y manejo de errores más robusto
app.get('/pets/:id', async (req, res) => {
  try {
    const pet = findPetById(req.params.id);

    if (!pet) {
      logger.warn('PET_NOT_FOUND', {
        id: req.params.id,
      });

      return res.status(404).json({
        error: 'Mascota no encontrada',
      });
    }

    await sendEvent('QUERY', pet);

    logger.info('PET_QUERIED', {
      id: pet.id,
    });

    return res.json(pet);
  } catch (error) {
    logger.error('PET_QUERY_ERROR', {
      id: req.params.id,
      error: error.message,
    });

    return res.status(500).json({
      error: 'Error interno al consultar mascota',
    });
  }
});



// Versión mejorada de la ruta POST /pets con logging y manejo de errores más robusto

/*
app.post('/pets', async (req, res) => {
  const errors = validatePet(req.body);

  if (errors.length) {
    return res.status(400).json({ error: errors.join(', ') });
  }

  const pet = insertPet(req.body);
  await sendEvent('CREATE', pet);

  return res.status(201).json(pet);
});
*/

app.post('/pets', async (req, res) => {
  try {
    const errors = validatePet(req.body);

    if (errors.length) {
      logger.warn('PET_VALIDATION_ERROR', {
        operation: 'CREATE',
        errors,
      });

      return res.status(400).json({
        error: errors.join(', '),
      });
    }

    const pet = insertPet(req.body);
    await sendEvent('CREATE', pet);

    logger.info('PET_CREATED', {
      id: pet.id,
      name: pet.name,
      species: pet.species,
    });

    return res.status(201).json(pet);
  } catch (error) {
    logger.error('PET_CREATE_ERROR', {
      error: error.message,
    });

    return res.status(500).json({
      error: 'Error interno al crear mascota',
    });
  }
});


/*
app.put('/pets/:id', async (req, res) => {
  const exists = findPetById(req.params.id);

  if (!exists) {
    return res.status(404).json({ error: 'Mascota no encontrada' });
  }

  const errors = validatePet(req.body, true);

  if (errors.length) {
    return res.status(400).json({ error: errors.join(', ') });
  }

  const updated = updatePet(req.params.id, req.body);
  await sendEvent('UPDATE', updated);

  return res.json(updated);
});
*/
app.put('/pets/:id', async (req, res) => {
  try {
    const exists = findPetById(req.params.id);

    if (!exists) {
      logger.warn('PET_UPDATE_NOT_FOUND', {
        id: req.params.id,
      });

      return res.status(404).json({
        error: 'Mascota no encontrada',
      });
    }

    const errors = validatePet(req.body, true);

    if (errors.length) {
      logger.warn('PET_VALIDATION_ERROR', {
        operation: 'UPDATE',
        id: req.params.id,
        errors,
      });

      return res.status(400).json({
        error: errors.join(', '),
      });
    }

    const updated = updatePet(req.params.id, req.body);
    await sendEvent('UPDATE', updated);

    logger.info('PET_UPDATED', {
      id: updated.id,
    });

    return res.json(updated);
  } catch (error) {
    logger.error('PET_UPDATE_ERROR', {
      id: req.params.id,
      error: error.message,
    });

    return res.status(500).json({
      error: 'Error interno al actualizar mascota',
    });
  }
});



/*
app.delete('/pets/:id', async (req, res) => {
  const deleted = deletePetById(req.params.id);

  if (!deleted) {
    return res.status(404).json({ error: 'Mascota no encontrada' });
  }

  await sendEvent('DELETE', deleted);

  return res.json({
    message: 'Mascota eliminada',
    pet: deleted,
  });
});
*/

app.delete('/pets/:id', async (req, res) => {
  try {
    const deleted = deletePetById(req.params.id);

    if (!deleted) {
      logger.warn('PET_DELETE_NOT_FOUND', {
        id: req.params.id,
      });

      return res.status(404).json({
        error: 'Mascota no encontrada',
      });
    }

    await sendEvent('DELETE', deleted);

    logger.info('PET_DELETED', {
      id: deleted.id,
      name: deleted.name,
    });

    return res.json({
      message: 'Mascota eliminada',
      pet: deleted,
    });
  } catch (error) {
    logger.error('PET_DELETE_ERROR', {
      id: req.params.id,
      error: error.message,
    });

    return res.status(500).json({
      error: 'Error interno al eliminar mascota',
    });
  }
});


function startServer() {
  return app.listen(PORT, () => {
    console.log(`🐾 Sistema de Gestión de Mascotas corriendo en http://localhost:${PORT}`);
    console.log(`🗄️ Base de datos: ${DB_PATH}`);
    console.log('📡 Enviando eventos al Event Manager en http://localhost:3000');
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  clean,
  normalizeSpecies,
  normalizeStatus,
  validatePet,
  requireApiKey,
  getPetStats,
  findAllPets,
  findPetById,
  insertPet,
  updatePet,
  deletePetById,
  startServer,
};