const { notFound, conflict } = require('../utils/httpError');

/**
 * Suma los cambios por producto y descarta los que quedan en cero.
 * cambios: [{ productoId, delta }] (delta con signo: + entra, - sale).
 */
function consolidarCambios(cambios) {
  const mapa = new Map();
  for (const { productoId, delta } of cambios) {
    mapa.set(productoId, (mapa.get(productoId) || 0) + delta);
  }
  return [...mapa.entries()]
    .filter(([, delta]) => delta !== 0)
    .map(([productoId, delta]) => ({ productoId, delta }))
    .sort((a, b) => a.productoId - b.productoId);
}

/**
 * Aplica cambios de stock y los registra en movimientos_inventario.
 * DEBE llamarse con un `client` dentro de una transacción (withTransaction):
 *  - bloquea las filas de producto (FOR UPDATE, en orden de id para evitar deadlocks),
 *  - valida TODO antes de escribir: si algún producto quedaría en negativo se rechaza
 *    indicando cuáles, y el ROLLBACK de la transacción deja todo intacto,
 *  - ignora productos sin seguimiento de inventario.
 */
async function aplicarMovimientos(client, cambios, contexto) {
  const { tipo, ventaId = null, compraId = null, reembolsoId = null, usuarioId = null, nota = null } = contexto;
  const consolidados = consolidarCambios(cambios);
  if (!consolidados.length) return [];

  const ids = consolidados.map((c) => c.productoId);
  const { rows } = await client.query(
    `SELECT id, nombre, stock, seguimiento_inventario AS seguimiento
       FROM productos WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE`,
    [ids]
  );
  const productos = new Map(rows.map((p) => [p.id, p]));

  const insuficientes = [];
  const aplicables = [];
  for (const { productoId, delta } of consolidados) {
    const producto = productos.get(productoId);
    if (!producto) throw notFound(`El producto ${productoId} no existe.`);
    if (!producto.seguimiento) continue;
    const nuevoStock = producto.stock + delta;
    if (nuevoStock < 0) {
      insuficientes.push({
        productoId,
        producto: producto.nombre,
        stockDisponible: producto.stock,
        unidadesFaltantes: -nuevoStock
      });
    } else {
      aplicables.push({ productoId, delta, nuevoStock });
    }
  }

  if (insuficientes.length) {
    const lista = insuficientes
      .map((i) => `${i.producto} (disponible ${i.stockDisponible}, faltan ${i.unidadesFaltantes})`)
      .join('; ');
    throw conflict(`Stock insuficiente: ${lista}.`, { productos: insuficientes });
  }

  for (const { productoId, delta, nuevoStock } of aplicables) {
    await client.query('UPDATE productos SET stock = $2, updated_at = NOW() WHERE id = $1', [productoId, nuevoStock]);
    await client.query(
      `INSERT INTO movimientos_inventario
         (producto_id, tipo, cantidad, stock_resultante, venta_id, compra_id, reembolso_id, usuario_id, nota)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [productoId, tipo, delta, nuevoStock, ventaId, compraId, reembolsoId, usuarioId, nota]
    );
  }
  return aplicables;
}

module.exports = { consolidarCambios, aplicarMovimientos };
