const { badRequest } = require('../utils/httpError');

const SELECT = `
  SELECT p.id, p.nombre, p.categoria_id AS "categoriaId", c.nombre AS categoria, c.color AS "categoriaColor",
         p.costo, p.precio, p.codigo_interno AS "codigoInterno",
         p.seguimiento_inventario AS "seguimientoInventario", p.stock,
         p.created_at AS "creadoEn", p.updated_at AS "actualizadoEn"
    FROM productos p
    LEFT JOIN categorias c ON c.id = p.categoria_id`;

/** Producto con sus proveedores (y el costo de cada uno). `db` es pool o client. */
async function buscar(db, id) {
  const { rows } = await db.query(`${SELECT} WHERE p.id = $1`, [id]);
  if (!rows.length) return null;
  const { rows: proveedores } = await db.query(
    `SELECT pp.proveedor_id AS "proveedorId", pr.nombre, pr.nit, pp.costo
       FROM producto_proveedor pp JOIN proveedores pr ON pr.id = pp.proveedor_id
      WHERE pp.producto_id = $1 ORDER BY pp.costo, pr.nombre`,
    [id]
  );
  return { ...rows[0], proveedores };
}

async function verificarCategoria(db, categoriaId) {
  if (!categoriaId) return;
  const { rows } = await db.query('SELECT 1 FROM categorias WHERE id = $1', [categoriaId]);
  if (!rows.length) throw badRequest(`La categoría ${categoriaId} no existe.`);
}

module.exports = { SELECT, buscar, verificarCategoria };
