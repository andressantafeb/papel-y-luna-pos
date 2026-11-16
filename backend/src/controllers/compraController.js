const { query, pool, withTransaction } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { notFound, badRequest } = require('../utils/httpError');
const { idParam, entero, numero, texto, fecha } = require('../utils/validators');
const { condicionesRango, paginacion } = require('../utils/sql');
const compraService = require('../services/compraService');

const SELECT = `
  SELECT c.id, c.proveedor_id AS "proveedorId", pr.nombre AS proveedor, c.total, c.observacion,
         c.usuario_id AS "usuarioId", u.nombre AS usuario, c.created_at AS fecha
    FROM compras c
    JOIN proveedores pr ON pr.id = c.proveedor_id
    JOIN usuarios u ON u.id = c.usuario_id`;

async function detalle(db, id) {
  const { rows } = await db.query(`${SELECT} WHERE c.id = $1`, [id]);
  if (!rows.length) return null;
  const { rows: items } = await db.query(
    `SELECT ci.producto_id AS "productoId", p.nombre, ci.cantidad, ci.costo_unitario AS "costoUnitario", ci.subtotal
       FROM compra_items ci JOIN productos p ON p.id = ci.producto_id
      WHERE ci.compra_id = $1 ORDER BY ci.id`,
    [id]
  );
  return { ...rows[0], items };
}

// GET /api/compras?proveedorId=&desde=&hasta=&limit=&offset=
const listar = asyncHandler(async (req, res) => {
  const { proveedorId, desde, hasta, limit, offset } = req.query;
  const params = [];
  const condiciones = [];
  if (proveedorId) { params.push(idParam(proveedorId, 'proveedorId')); condiciones.push(`c.proveedor_id = $${params.length}`); }
  condiciones.push(...condicionesRango('c.created_at', fecha(desde, 'desde'), fecha(hasta, 'hasta'), params));
  const pag = paginacion(limit, offset);
  params.push(pag.limit, pag.offset);
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const { rows } = await query(
    `${SELECT} ${where} ORDER BY c.created_at DESC, c.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json(rows);
});

const obtener = asyncHandler(async (req, res) => {
  const compra = await detalle(pool, idParam(req.params.id));
  if (!compra) throw notFound('La compra no existe.');
  res.json(compra);
});

// POST /api/compras  { proveedorId, items: [{ productoId, cantidad, costoUnitario }], observacion? }
const crear = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const proveedorId = entero(b.proveedorId, 'proveedorId', { min: 1 });
  if (!Array.isArray(b.items) || !b.items.length) throw badRequest('Agrega al menos un producto a la compra.');
  const vistos = new Set();
  const items = b.items.map((item, i) => {
    const productoId = entero(item?.productoId, `items[${i}].productoId`, { min: 1 });
    if (vistos.has(productoId)) throw badRequest(`El producto ${productoId} está repetido en la compra.`);
    vistos.add(productoId);
    return {
      productoId,
      cantidad: entero(item?.cantidad, `items[${i}].cantidad`, { min: 1 }),
      costoUnitario: numero(item?.costoUnitario, `items[${i}].costoUnitario`, { min: 0 })
    };
  });
  const observacion = texto(b.observacion, 'observacion', { requerido: false, max: 300 });

  const { compraId: id, faltantesResueltos } = await withTransaction((client) =>
    compraService.registrar(client, req.usuario, { proveedorId, items, observacion })
  );
  res.status(201).json({ ...(await detalle(pool, id)), faltantesResueltos });
});

module.exports = { listar, obtener, crear };
