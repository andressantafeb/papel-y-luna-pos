const { badRequest } = require('../utils/httpError');
const { redondear } = require('../utils/validators');
const { aplicarMovimientos } = require('./inventario');
const { normalizarNombre } = require('../utils/normalizar');

/**
 * Registra una compra (RF-90 a RF-97): guarda cabecera y detalle, suma stock,
 * actualiza el costo del producto y su relación con el proveedor, y resuelve
 * los faltantes pendientes de los productos comprados (RF-154).
 * items: [{ productoId, cantidad, costoUnitario }]
 */
async function registrar(client, usuario, { proveedorId, items, observacion }) {
  const { rows: prov } = await client.query('SELECT id FROM proveedores WHERE id = $1', [proveedorId]);
  if (!prov.length) throw badRequest(`El proveedor ${proveedorId} no existe.`);

  const { rows: productos } = await client.query(
    'SELECT id, nombre FROM productos WHERE id = ANY($1::int[])',
    [items.map((i) => i.productoId)]
  );
  if (productos.length !== items.length) {
    const existentes = new Set(productos.map((p) => p.id));
    const faltante = items.find((i) => !existentes.has(i.productoId));
    throw badRequest(`El producto ${faltante.productoId} no existe.`);
  }

  const lineas = items.map((i) => ({ ...i, subtotal: redondear(i.cantidad * i.costoUnitario) }));
  const total = redondear(lineas.reduce((suma, l) => suma + l.subtotal, 0));

  const { rows } = await client.query(
    `INSERT INTO compras (proveedor_id, usuario_id, total, observacion)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [proveedorId, usuario.id, total, observacion || null]
  );
  const compraId = rows[0].id;

  for (const l of lineas) {
    await client.query(
      `INSERT INTO compra_items (compra_id, producto_id, cantidad, costo_unitario, subtotal)
       VALUES ($1, $2, $3, $4, $5)`,
      [compraId, l.productoId, l.cantidad, l.costoUnitario, l.subtotal]
    );
    // El costo del producto pasa a ser el de la última compra y se recuerda por proveedor.
    await client.query('UPDATE productos SET costo = $2, updated_at = NOW() WHERE id = $1', [l.productoId, l.costoUnitario]);
    await client.query(
      `INSERT INTO producto_proveedor (producto_id, proveedor_id, costo)
       VALUES ($1, $2, $3)
       ON CONFLICT (producto_id, proveedor_id) DO UPDATE SET costo = EXCLUDED.costo, updated_at = NOW()`,
      [l.productoId, proveedorId, l.costoUnitario]
    );
  }

  await aplicarMovimientos(
    client,
    lineas.map((l) => ({ productoId: l.productoId, delta: l.cantidad })),
    { tipo: 'compra', compraId, usuarioId: usuario.id, nota: `Compra #${compraId}` }
  );

  // Resuelve los faltantes pendientes de los productos comprados: los ligados a un producto (agotados) y
  // los descritos solo en texto (inexistentes) cuyo nombre normalizado coincide con el del producto comprado.
  const resueltos = await client.query(
    `UPDATE faltantes SET estado = 'resuelto', resuelto_en = NOW()
      WHERE estado = 'pendiente'
        AND (producto_id = ANY($1::int[])
             OR (producto_id IS NULL AND nombre_normalizado = ANY($2::text[])))
      RETURNING id`,
    [lineas.map((l) => l.productoId), productos.map((p) => normalizarNombre(p.nombre))]
  );
  return { compraId, faltantesResueltos: resueltos.rowCount };
}

module.exports = { registrar };
