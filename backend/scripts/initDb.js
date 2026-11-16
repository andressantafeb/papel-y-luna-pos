// Crea las tablas ejecutando db/schema.sql.
//   npm run db:init   -> crea lo que falte (no borra datos)
//   npm run db:reset  -> BORRA todas las tablas y las vuelve a crear
const fs = require('fs');
const path = require('path');
const env = require('../src/config/env');
env.validarEntorno(['databaseUrl']);
const { pool } = require('../src/config/db');

const TABLAS = [
  'abonos', 'faltantes', 'movimientos_inventario', 'compra_items', 'compras', 'reembolso_items', 'reembolsos',
  'venta_items', 'ventas', 'producto_proveedor', 'productos', 'descuentos', 'clientes',
  'proveedores', 'categorias', 'usuarios'
];

(async () => {
  try {
    if (process.argv.includes('--reset')) {
      await pool.query(`DROP TABLE IF EXISTS ${TABLAS.join(', ')} CASCADE`);
      console.log('Tablas anteriores eliminadas.');
    }
    const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('Esquema creado correctamente.');
  } catch (error) {
    console.error('No se pudo crear el esquema:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
