const { withTransaction, query, pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { notFound, badRequest } = require('../utils/httpError');
const { idParam, entero, texto, opcion, fecha } = require('../utils/validators');
const { condicionesRango, paginacion } = require('../utils/sql');
const { aplicarMovimientos } = require('../services/inventario');

const TIPOS = ['inicial', 'venta', 'correccion', 'reembolso', 'compra', 'ajuste'];

// GET /api/inventario/movimientos?productoId=&tipo=&ventaId=&compraId=&desde=&hasta=&limit=&offset=
const listarMovimientos = asyncHandler(async (req, res) => {
  const { productoId, tipo, ventaId, compraId, desde, hasta, limit, offset } = req.query;
  const params = [];
  const condiciones = [];
  if (productoId) { params.push(idParam(productoId, 'productoId')); condiciones.push(`m.producto_id = $${params.length}`); }
  if (tipo) { params.push(opcion(tipo, 'tipo', TIPOS)); condiciones.push(`m.tipo = $${params.length}`); }
  if (ventaId) { params.push(idParam(ventaId, 'ventaId')); condiciones.push(`m.venta_id = $${params.length}`); }
  if (compraId) { params.push(idParam(compraId, 'compraId')); condiciones.push(`m.compra_id = $${params.length}`); }
  condiciones.push(...condicionesRango('m.created_at', fecha(desde, 'desde'), fecha(hasta, 'hasta'), params));

  const pag = paginacion(limit, offset);
  params.push(pag.limit, pag.offset);
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT m.id, m.producto_id AS "productoId", p.nombre AS producto, m.tipo, m.cantidad,
            m.stock_resultante AS "stockResultante", m.venta_id AS "ventaId", m.compra_id AS "compraId",
            m.reembolso_id AS "reembolsoId", m.usuario_id AS "usuarioId", u.nombre AS usuario,
            m.nota, m.created_at AS fecha
       FROM movimientos_inventario m
       JOIN productos p ON p.id = m.producto_id
       LEFT JOIN usuarios u ON u.id = m.usuario_id
       ${where}
      ORDER BY m.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json(rows);
});

// GET /api/inventario/productos/:id/movimientos -> kardex de un producto
const kardex = asyncHandler(async (req, res) => {
  const id = idParam(req.params.id);
  const { rows: prod } = await query('SELECT id, nombre, stock, seguimiento_inventario AS "seguimientoInventario" FROM productos WHERE id = $1', [id]);
  if (!prod.length) throw notFound('El producto no existe.');
  const { rows } = await query(
    `SELECT m.id, m.tipo, m.cantidad, m.stock_resultante AS "stockResultante", m.venta_id AS "ventaId",
            m.compra_id AS "compraId", m.reembolso_id AS "reembolsoId", u.nombre AS usuario, m.nota, m.created_at AS fecha
       FROM movimientos_inventario m LEFT JOIN usuarios u ON u.id = m.usuario_id
      WHERE m.producto_id = $1 ORDER BY m.id DESC LIMIT 500`,
    [id]
  );
  res.json({ producto: prod[0], movimientos: rows });
});

// POST /api/inventario/ajustes  { productoId, cantidad, nota }  (administrador)
// "cantidad" es la variación con signo (ej. -3 por merma, +5 por conteo). Se rechaza si deja el stock negativo.
const ajustar = asyncHandler(async (req, res) => {
  const productoId = entero(req.body?.productoId, 'productoId', { min: 1 });
  const delta = entero(req.body?.cantidad, 'cantidad', { min: -1000000 });
  if (delta === 0) throw badRequest('La cantidad del ajuste no puede ser cero.');
  const nota = texto(req.body?.nota, 'nota', { max: 300 });

  await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT seguimiento_inventario AS seguimiento FROM productos WHERE id = $1', [productoId]);
    if (!rows.length) throw notFound('El producto no existe.');
    if (!rows[0].seguimiento) throw badRequest('El producto no tiene seguimiento de inventario activo.');
    await aplicarMovimientos(client, [{ productoId, delta }], { tipo: 'ajuste', usuarioId: req.usuario.id, nota });
  });

  const { rows } = await pool.query('SELECT id, nombre, stock FROM productos WHERE id = $1', [productoId]);
  res.status(201).json(rows[0]);
});

module.exports = { listarMovimientos, kardex, ajustar };
