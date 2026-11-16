const { Pool, types } = require('pg');
const env = require('./env');

// NUMERIC llega de PostgreSQL como string; lo convertimos a número para el JSON.
types.setTypeParser(1700, (valor) => (valor === null ? null : parseFloat(valor)));
// BIGINT (movimientos_inventario.id) también como número (los valores son pequeños).
types.setTypeParser(20, (valor) => (valor === null ? null : parseInt(valor, 10)));

const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: env.dbSsl ? { rejectUnauthorized: false } : false
});

pool.on('error', (error) => {
  console.error('Error inesperado en el pool de PostgreSQL:', error.message);
});

const query = (texto, parametros) => pool.query(texto, parametros);

/**
 * Ejecuta `callback(client)` dentro de una transacción.
 * Si el callback lanza un error se hace ROLLBACK y no queda nada a medias.
 */
async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await callback(client);
    await client.query('COMMIT');
    return resultado;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
