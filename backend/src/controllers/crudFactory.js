const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { notFound, conflict } = require('../utils/httpError');
const { idParam } = require('../utils/validators');

// Valor enviado en la petición; si no viene, el valor actual (actualizaciones parciales).
const pick = (body, campo, actual) => {
  if (body && body[campo] !== undefined) return body[campo];
  return actual ? actual[campo] : undefined;
};

/**
 * Genera los 5 handlers de un CRUD simple.
 *  - select: SQL base con la tabla aliasada como "t" (sin WHERE ni ORDER BY); devuelve camelCase.
 *  - leer(body, actual): valida y devuelve { columna: valor } listo para INSERT/UPDATE.
 *  - referencias: [{ sql, mensaje }] consultas COUNT(*) AS total con $1 = id; si total > 0 no se elimina.
 */
function crearCrud({ tabla, select, orderBy, mensajes, leer, referencias = [] }) {
  const buscar = async (id) => {
    const { rows } = await query(`${select} WHERE t.id = $1`, [id]);
    return rows[0] || null;
  };

  const listar = asyncHandler(async (req, res) => {
    const { rows } = await query(`${select} ORDER BY ${orderBy}`);
    res.json(rows);
  });

  const obtener = asyncHandler(async (req, res) => {
    const fila = await buscar(idParam(req.params.id));
    if (!fila) throw notFound(mensajes.noExiste);
    res.json(fila);
  });

  const crear = asyncHandler(async (req, res) => {
    const datos = leer(req.body || {}, null);
    const columnas = Object.keys(datos);
    const { rows } = await query(
      `INSERT INTO ${tabla} (${columnas.join(', ')})
       VALUES (${columnas.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      columnas.map((c) => datos[c])
    );
    res.status(201).json(await buscar(rows[0].id));
  });

  const actualizar = asyncHandler(async (req, res) => {
    const id = idParam(req.params.id);
    const actual = await buscar(id);
    if (!actual) throw notFound(mensajes.noExiste);
    const datos = leer(req.body || {}, actual);
    const columnas = Object.keys(datos);
    await query(
      `UPDATE ${tabla} SET ${columnas.map((c, i) => `${c} = $${i + 1}`).join(', ')} WHERE id = $${columnas.length + 1}`,
      [...columnas.map((c) => datos[c]), id]
    );
    res.json(await buscar(id));
  });

  const eliminar = asyncHandler(async (req, res) => {
    const id = idParam(req.params.id);
    if (!(await buscar(id))) throw notFound(mensajes.noExiste);
    for (const ref of referencias) {
      const { rows } = await query(ref.sql, [id]);
      if (rows[0].total > 0) throw conflict(ref.mensaje);
    }
    await query(`DELETE FROM ${tabla} WHERE id = $1`, [id]);
    res.json({ mensaje: mensajes.eliminado });
  });

  return { listar, obtener, crear, actualizar, eliminar };
}

module.exports = { crearCrud, pick };
