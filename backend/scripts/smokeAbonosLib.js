// Utilidades de la prueba de abonos (llamadas HTTP, verificaciones y registro en el log).
const fs = require('fs');
const os = require('os');
const path = require('path');
const env = require('../src/config/env');

const LOG = path.join(os.tmpdir(), 'smoke-abonos.log');
const lineas = [];
const estado = { base: '', ok: 0, fallos: 0, ids: { ventas: [] } };

const escribir = (t) => { lineas.push(t); fs.writeFileSync(LOG, lineas.join('\n')); };

async function llamar(metodo, ruta, cuerpo, token) {
  const res = await fetch(estado.base + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* sin cuerpo */ }
  return { status: res.status, data };
}

function verificar(nombre, condicion, detalle) {
  if (condicion) { estado.ok += 1; escribir(`  OK    ${nombre}`); return; }
  estado.fallos += 1;
  escribir(`  FALLO ${nombre}${detalle !== undefined ? ' -> ' + JSON.stringify(detalle).slice(0, 400) : ''}`);
}

const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: env.timezone }).format(new Date());

// Crea una venta abierta con `cantidad` unidades del producto y la registra para la limpieza final.
async function crearVenta(token, productoId, cantidad) {
  const r = await llamar('POST', '/api/ventas', { items: [{ productoId, cantidad }] }, token);
  estado.ids.ventas.push(r.data.id);
  return r.data.id;
}

// Elimina únicamente lo creado por la prueba (su cliente, su producto, sus descuentos y sus ventas).
async function limpiar() {
  const { pool } = require('../src/config/db');
  const { cliente, producto, ventas, descuentos = [], faltantes = [] } = estado.ids;
  if (faltantes.length) await pool.query('DELETE FROM faltantes WHERE id = ANY($1::int[])', [faltantes]);
  if (cliente) await pool.query('DELETE FROM abonos WHERE cliente_id = $1', [cliente]);
  if (ventas.length) {
    await pool.query('DELETE FROM reembolsos WHERE venta_id = ANY($1::int[])', [ventas]);
    await pool.query('DELETE FROM ventas WHERE id = ANY($1::int[])', [ventas]);
  }
  if (producto) {
    await pool.query('DELETE FROM movimientos_inventario WHERE producto_id = $1', [producto]);
    await pool.query('DELETE FROM productos WHERE id = $1', [producto]);
  }
  if (cliente) await pool.query('DELETE FROM clientes WHERE id = $1', [cliente]);
  if (descuentos.length) await pool.query('DELETE FROM descuentos WHERE id = ANY($1::int[])', [descuentos]);
  escribir('Datos de prueba eliminados.');
}

module.exports = { estado, escribir, llamar, verificar, hoy, crearVenta, limpiar };
