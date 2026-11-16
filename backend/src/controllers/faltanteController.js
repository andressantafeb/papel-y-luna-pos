const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { notFound, badRequest, conflict } = require('../utils/httpError');
const { idParam, idOpcional, entero, texto, opcion, fecha } = require('../utils/validators');
const { condicionesRango, paginacion } = require('../utils/sql');
const { normalizarNombre } = require('../utils/normalizar');

const SELECT = `
  SELECT f.id, f.producto_id AS "productoId", f.nombre_producto AS producto,
         f.nombre_normalizado AS "nombreNormalizado", f.cantidad, f.tipo,
         f.proveedor_id AS "proveedorId", pr.nombre AS proveedor, f.observacion, f.estado,
         f.usuario_id AS "usuarioId", u.nombre AS usuario, f.created_at AS fecha, f.resuelto_en AS "resueltoEn"
    FROM faltantes f
    LEFT JOIN proveedores pr ON pr.id = f.proveedor_id
    LEFT JOIN usuarios u ON u.id = f.usuario_id`;

async function buscar(id) {
  const { rows } = await query(`${SELECT} WHERE f.id = $1`, [id]);
  return rows[0] || null;
}

// GET /api/faltantes?tipo=&proveedorId=&estado=&desde=&hasta=
const listar = asyncHandler(async (req, res) => {
  const { tipo, proveedorId, estado, desde, hasta, limit, offset } = req.query;
  const params = [];
  const condiciones = [];
  if (tipo) { params.push(opcion(tipo, 'tipo', ['inexistente', 'agotado'])); condiciones.push(`f.tipo = $${params.length}`); }
  if (proveedorId) { params.push(idParam(proveedorId, 'proveedorId')); condiciones.push(`f.proveedor_id = $${params.length}`); }
  if (estado) { params.push(opcion(estado, 'estado', ['pendiente', 'resuelto'])); condiciones.push(`f.estado = $${params.length}`); }
  condiciones.push(...condicionesRango('f.created_at', fecha(desde, 'desde'), fecha(hasta, 'hasta'), params));
  const pag = paginacion(limit, offset);
  params.push(pag.limit, pag.offset);
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const { rows } = await query(
    `${SELECT} ${where} ORDER BY f.created_at DESC, f.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json(rows);
});

// POST /api/faltantes  { productoId? | nombreProducto?, cantidad, tipo, proveedorId?, observacion? }
// Con productoId el nombre se toma del inventario; sin él, se describe en texto.
// Nunca modifica inventario ni ventas (RN-09).
const crear = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const productoId = idOpcional(b.productoId, 'productoId') || null;
  const proveedorId = idOpcional(b.proveedorId, 'proveedorId') || null;
  const cantidad = entero(b.cantidad ?? 1, 'cantidad', { min: 1 });
  const tipo = opcion(b.tipo, 'tipo', ['inexistente', 'agotado']);
  const observacion = texto(b.observacion, 'observacion', { requerido: false, max: 300 });

  let nombre;
  if (productoId) {
    const { rows } = await query('SELECT nombre FROM productos WHERE id = $1', [productoId]);
    if (!rows.length) throw badRequest(`El producto ${productoId} no existe.`);
    nombre = rows[0].nombre;
  } else {
    if (tipo === 'agotado') throw badRequest('Un faltante "agotado" debe indicar el producto existente (productoId).');
    nombre = texto(b.nombreProducto, 'nombreProducto');
  }
  if (proveedorId) {
    const { rows } = await query('SELECT 1 FROM proveedores WHERE id = $1', [proveedorId]);
    if (!rows.length) throw badRequest(`El proveedor ${proveedorId} no existe.`);
  }

  const { rows } = await query(
    `INSERT INTO faltantes (producto_id, nombre_producto, nombre_normalizado, cantidad, tipo, proveedor_id, observacion, usuario_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [productoId, nombre, normalizarNombre(nombre), cantidad, tipo, proveedorId, observacion, req.usuario.id]
  );
  res.status(201).json(await buscar(rows[0].id));
});

// PUT /api/faltantes/:id/resolver
const resolver = asyncHandler(async (req, res) => {
  const id = idParam(req.params.id);
  const actual = await buscar(id);
  if (!actual) throw notFound('El faltante no existe.');
  if (actual.estado === 'resuelto') throw conflict('El faltante ya estaba resuelto.');
  await query("UPDATE faltantes SET estado = 'resuelto', resuelto_en = NOW() WHERE id = $1", [id]);
  res.json(await buscar(id));
});

// GET /api/faltantes/resumen -> pendientes agrupados por nombre normalizado y proveedor (apoyo a compras)
const resumen = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT f.nombre_normalizado AS "nombreNormalizado",
            (ARRAY_AGG(f.nombre_producto ORDER BY f.created_at DESC))[1] AS producto,
            f.proveedor_id AS "proveedorId", pr.nombre AS proveedor,
            COUNT(*)::int AS solicitudes, SUM(f.cantidad)::int AS "cantidadTotal", MAX(f.created_at) AS "ultimaSolicitud"
       FROM faltantes f LEFT JOIN proveedores pr ON pr.id = f.proveedor_id
      WHERE f.estado = 'pendiente'
      GROUP BY f.nombre_normalizado, f.proveedor_id, pr.nombre
      ORDER BY solicitudes DESC, "ultimaSolicitud" DESC`
  );
  res.json(rows);
});

module.exports = { listar, crear, resolver, resumen };
