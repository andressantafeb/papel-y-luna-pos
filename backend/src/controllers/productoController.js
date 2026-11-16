const { query, withTransaction } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { notFound, conflict, badRequest } = require('../utils/httpError');
const { idParam, idOpcional, entero, numero, texto } = require('../utils/validators');
const { SELECT, buscar, verificarCategoria } = require('../models/productoModel');

function booleano(valor, campo, porDefecto) {
  if (valor === undefined) return porDefecto;
  if (typeof valor !== 'boolean') throw badRequest(`El campo "${campo}" debe ser verdadero o falso.`);
  return valor;
}

// GET /api/productos?q=&categoriaId=&conStock=true   (ambos roles: consulta de productos)
const listar = asyncHandler(async (req, res) => {
  const { q, categoriaId, conStock } = req.query;
  const params = [];
  const condiciones = [];
  if (q && String(q).trim()) {
    params.push(`%${String(q).trim()}%`);
    condiciones.push(`(p.nombre ILIKE $${params.length} OR p.codigo_interno ILIKE $${params.length})`);
  }
  if (categoriaId) { params.push(idParam(categoriaId, 'categoriaId')); condiciones.push(`p.categoria_id = $${params.length}`); }
  if (conStock === 'true') condiciones.push('(p.seguimiento_inventario = FALSE OR p.stock > 0)');
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const { rows } = await query(`${SELECT} ${where} ORDER BY p.nombre`, params);
  res.json(rows);
});

const obtener = asyncHandler(async (req, res) => {
  const producto = await buscar({ query }, idParam(req.params.id));
  if (!producto) throw notFound('El producto no existe.');
  res.json(producto);
});

// POST /api/productos (administrador). El stock inicial queda registrado como movimiento "inicial".
const crear = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const nombre = texto(b.nombre, 'nombre');
  const categoriaId = idOpcional(b.categoriaId, 'categoriaId') || null;
  const costo = numero(b.costo ?? 0, 'costo');
  const precio = numero(b.precio, 'precio');
  const codigoInterno = texto(b.codigoInterno, 'codigoInterno', { requerido: false, max: 50 });
  const seguimiento = booleano(b.seguimientoInventario, 'seguimientoInventario', true);
  const stock = seguimiento ? entero(b.stock ?? 0, 'stock', { min: 0 }) : 0;

  const id = await withTransaction(async (client) => {
    await verificarCategoria(client, categoriaId);
    const { rows } = await client.query(
      `INSERT INTO productos (nombre, categoria_id, costo, precio, codigo_interno, seguimiento_inventario, stock)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [nombre, categoriaId, costo, precio, codigoInterno, seguimiento, stock]
    );
    if (stock > 0) {
      await client.query(
        `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, stock_resultante, usuario_id, nota)
         VALUES ($1, 'inicial', $2, $2, $3, 'Stock inicial al crear el producto')`,
        [rows[0].id, stock, req.usuario.id]
      );
    }
    return rows[0].id;
  });
  res.status(201).json(await buscar({ query }, id));
});

// PUT /api/productos/:id (ambos roles: edición "en caliente" desde la venta).
// El stock NO se edita aquí: se mueve con ventas, compras, correcciones, reembolsos o /api/inventario/ajustes.
const actualizar = asyncHandler(async (req, res) => {
  const id = idParam(req.params.id);
  const actual = await buscar({ query }, id);
  if (!actual) throw notFound('El producto no existe.');
  const b = req.body || {};

  const categoriaId = b.categoriaId !== undefined ? idOpcional(b.categoriaId, 'categoriaId') : actual.categoriaId;
  await verificarCategoria({ query }, categoriaId);
  const seguimiento = booleano(b.seguimientoInventario, 'seguimientoInventario', actual.seguimientoInventario);
  if (!seguimiento && actual.seguimientoInventario && actual.stock > 0) {
    throw conflict('No se puede desactivar el seguimiento mientras el producto tenga stock. Ajusta el stock a 0 primero.');
  }

  await query(
    `UPDATE productos SET nombre = $2, categoria_id = $3, costo = $4, precio = $5, codigo_interno = $6,
            seguimiento_inventario = $7, updated_at = NOW() WHERE id = $1`,
    [
      id,
      b.nombre !== undefined ? texto(b.nombre, 'nombre') : actual.nombre,
      categoriaId || null,
      b.costo !== undefined ? numero(b.costo, 'costo') : actual.costo,
      b.precio !== undefined ? numero(b.precio, 'precio') : actual.precio,
      b.codigoInterno !== undefined ? texto(b.codigoInterno, 'codigoInterno', { requerido: false, max: 50 }) : actual.codigoInterno,
      seguimiento
    ]
  );
  res.json(await buscar({ query }, id));
});

// DELETE /api/productos/:id (administrador): no se elimina si ya aparece en ventas, compras o reembolsos.
const eliminar = asyncHandler(async (req, res) => {
  const id = idParam(req.params.id);
  if (!(await buscar({ query }, id))) throw notFound('El producto no existe.');
  const { rows } = await query(
    `SELECT (SELECT COUNT(*) FROM venta_items WHERE producto_id = $1)::int AS ventas,
            (SELECT COUNT(*) FROM compra_items WHERE producto_id = $1)::int AS compras,
            (SELECT COUNT(*) FROM reembolso_items WHERE producto_id = $1)::int AS reembolsos`,
    [id]
  );
  const uso = rows[0];
  if (uso.ventas || uso.compras || uso.reembolsos) {
    throw conflict('No se puede eliminar el producto porque tiene ventas, compras o reembolsos asociados.');
  }
  await query('DELETE FROM productos WHERE id = $1', [id]);
  res.json({ mensaje: 'Producto eliminado.' });
});

module.exports = { listar, obtener, crear, actualizar, eliminar };
