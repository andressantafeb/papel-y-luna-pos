// Datos iniciales: usuarios (administrador y cajero) y catálogo de ejemplo del MVP 1.
// Es idempotente: los usuarios se crean/actualizan y el catálogo solo se carga si no hay productos.
const bcrypt = require('bcryptjs');
const env = require('../src/config/env');
env.validarEntorno(['databaseUrl']);
const { pool, withTransaction } = require('../src/config/db');

const USUARIOS = [
  { nombre: 'Administrador', username: 'admin', rol: 'administrador', password: process.env.SEED_ADMIN_PASSWORD || 'Admin123*' },
  { nombre: 'Cajero', username: 'cajero', rol: 'cajero', password: process.env.SEED_CAJERO_PASSWORD || 'Cajero123*' }
];

const CATEGORIAS = [
  { nombre: 'Cuadernos', color: '#4c8bf5' },
  { nombre: 'Escritura', color: '#e8590c' },
  { nombre: 'Arte', color: '#be4bdb' },
  { nombre: 'Oficina', color: '#2f9e44' },
  { nombre: 'Accesorios', color: '#f08c00' }
];

// [nombre, categoría, precio, costo, código interno, stock]
const PRODUCTOS = [
  ['Cuaderno Argollado 100 Hojas', 'Cuadernos', 8500, 5000, 'CUA-001', 20],
  ['Cuaderno 7 Materias', 'Cuadernos', 30000, 19000, 'CUA-002', 10],
  ['Libreta de Notas Bolsillo', 'Cuadernos', 3900, 2200, 'CUA-003', 25],
  ['Esfero Punta Fina Azul', 'Escritura', 1500, 800, 'ESC-001', 60],
  ['Lápiz de Mina HB x 12', 'Escritura', 9800, 6200, 'ESC-002', 15],
  ['Set de Marcadores Permanentes', 'Escritura', 15400, 9500, 'ESC-003', 12],
  ['Resaltadores Pastel x5', 'Arte', 12900, 7600, 'ART-001', 14],
  ['Set de Colores x24', 'Arte', 22000, 13500, 'ART-002', 8],
  ['Tijeras Punta Roma', 'Oficina', 4700, 2800, 'OFI-001', 18],
  ['Pegante en Barra 40g', 'Oficina', 3200, 1800, 'OFI-002', 30],
  ['Corrector Líquido', 'Oficina', 2800, 1500, 'OFI-003', 22],
  ['Carpeta Plástica con Gancho', 'Oficina', 3500, 2100, 'OFI-004', 20],
  ['Calculadora Científica', 'Accesorios', 45900, 30000, 'ACC-001', 6],
  ['Agenda Ejecutiva 2026', 'Accesorios', 32500, 21000, 'ACC-002', 7],
  ['Mochila Escolar Reforzada', 'Accesorios', 68000, 43000, 'ACC-003', 5]
];

async function sembrarUsuarios(client) {
  for (const u of USUARIOS) {
    const hash = await bcrypt.hash(u.password, 10);
    await client.query(
      `INSERT INTO usuarios (nombre, username, password_hash, rol)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO UPDATE SET nombre = EXCLUDED.nombre, password_hash = EXCLUDED.password_hash,
                                            rol = EXCLUDED.rol, activo = TRUE`,
      [u.nombre, u.username, hash, u.rol]
    );
  }
  console.log('Usuarios listos: admin y cajero.');
}

async function sembrarCatalogo(client) {
  const { rows } = await client.query('SELECT COUNT(*)::int AS total FROM productos');
  if (rows[0].total > 0) {
    console.log('Ya existen productos: no se carga el catálogo de ejemplo.');
    return;
  }

  const categorias = new Map();
  for (const c of CATEGORIAS) {
    const r = await client.query(
      `INSERT INTO categorias (nombre, color) VALUES ($1, $2)
       ON CONFLICT (nombre) DO UPDATE SET color = EXCLUDED.color RETURNING id`,
      [c.nombre, c.color]
    );
    categorias.set(c.nombre, r.rows[0].id);
  }

  const { rows: admin } = await client.query("SELECT id FROM usuarios WHERE username = 'admin'");
  for (const [nombre, categoria, precio, costo, codigo, stock] of PRODUCTOS) {
    const r = await client.query(
      `INSERT INTO productos (nombre, categoria_id, precio, costo, codigo_interno, seguimiento_inventario, stock)
       VALUES ($1, $2, $3, $4, $5, TRUE, $6) RETURNING id`,
      [nombre, categorias.get(categoria), precio, costo, codigo, stock]
    );
    await client.query(
      `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, stock_resultante, usuario_id, nota)
       VALUES ($1, 'inicial', $2, $2, $3, 'Carga inicial de inventario')`,
      [r.rows[0].id, stock, admin[0].id]
    );
  }

  await client.query(
    `INSERT INTO clientes (nombre, telefono) VALUES ('Cliente de ejemplo', '3000000000')`
  );
  await client.query(
    `INSERT INTO proveedores (nombre, nit, telefono) VALUES ('Distribuidora Papelera S.A.S.', '900123456-7', '3011111111')
     ON CONFLICT (nit) DO NOTHING`
  );
  await client.query(
    `INSERT INTO descuentos (nombre, tipo, valor) VALUES ('10% de descuento', 'porcentaje', 10), ('Bono $2.000', 'fijo', 2000)
     ON CONFLICT (nombre) DO NOTHING`
  );
  console.log(`Catálogo de ejemplo cargado: ${PRODUCTOS.length} productos, ${CATEGORIAS.length} categorías, 1 cliente, 1 proveedor y 2 descuentos.`);
}

(async () => {
  try {
    await withTransaction(async (client) => {
      await sembrarUsuarios(client);
      await sembrarCatalogo(client);
    });
  } catch (error) {
    console.error('No se pudo cargar los datos iniciales:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
