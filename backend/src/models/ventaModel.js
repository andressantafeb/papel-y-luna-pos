const { condicionesRango, paginacion } = require('../utils/sql');
const { redondear } = require('../utils/validators');
const { desgloseReembolso } = require('../utils/reembolsoDesglose');

// Las columnas se devuelven ya en camelCase para el JSON de la API.
const SELECT_VENTA = `
  SELECT v.id, v.estado,
         v.cliente_id AS "clienteId", c.nombre AS "clienteNombre",
         v.metodo_pago AS "metodoPago", v.billetera, v.recibido, v.cambio,
         v.descuento_id AS "descuentoId", v.descuento_nombre AS "descuentoNombre",
         v.descuento_tipo AS "descuentoTipo", v.descuento_valor AS "descuentoValor",
         v.subtotal, v.descuento_monto AS "descuentoMonto", v.total,
         v.usuario_id AS "usuarioId", u.nombre AS "usuarioNombre",
         v.created_at AS "creadaEn", v.updated_at AS "actualizadaEn", v.cerrada_en AS "cerradaEn",
         v.corregida, v.corregida_por AS "corregidaPorId", uc.nombre AS "corregidaPorNombre",
         v.corregida_en AS "corregidaEn", v.estado_reembolso AS "estadoReembolso",
         v.abono_inicial AS "abonoInicial", v.metodo_abono AS "metodoAbono",
         (SELECT COALESCE(SUM(a.monto), 0) FROM abonos a WHERE a.venta_id = v.id) AS "totalAbonado",
         CASE WHEN v.estado = 'cerrada' AND v.metodo_pago = 'Debe'
              THEN GREATEST(0, v.total
                   - (SELECT COALESCE(SUM(a.monto), 0) FROM abonos a WHERE a.venta_id = v.id)
                   - (SELECT COALESCE(SUM(r.monto), 0) FROM reembolsos r WHERE r.venta_id = v.id))
              ELSE 0 END AS "saldoPendiente"
    FROM ventas v
    LEFT JOIN clientes c  ON c.id  = v.cliente_id
    JOIN usuarios u       ON u.id  = v.usuario_id
    LEFT JOIN usuarios uc ON uc.id = v.corregida_por`;

/** Fila de la venta (sin ítems). `bloquear` agrega FOR UPDATE para usar dentro de una transacción. */
async function obtenerPorId(db, id, { bloquear = false } = {}) {
  const { rows } = await db.query(`${SELECT_VENTA} WHERE v.id = $1 ${bloquear ? 'FOR UPDATE OF v' : ''}`, [id]);
  return rows[0] || null;
}

async function obtenerItems(db, ventaId) {
  const { rows } = await db.query(
    `SELECT id, producto_id AS "productoId", nombre_producto AS nombre,
            precio_unitario AS precio, cantidad, subtotal
       FROM venta_items WHERE venta_id = $1 ORDER BY id`,
    [ventaId]
  );
  return rows;
}

async function obtenerReembolsos(db, ventaId) {
  const { rows: reembolsos } = await db.query(
    `SELECT r.id, r.monto, r.observacion, r.created_at AS fecha,
            r.usuario_id AS "usuarioId", u.nombre AS "usuarioNombre"
       FROM reembolsos r JOIN usuarios u ON u.id = r.usuario_id
      WHERE r.venta_id = $1 ORDER BY r.id`,
    [ventaId]
  );
  if (!reembolsos.length) return [];

  const { rows: items } = await db.query(
    `SELECT ri.reembolso_id AS "reembolsoId", ri.producto_id AS "productoId", p.nombre,
            ri.cantidad, ri.monto, ri.retorna_inventario AS "retornaInventario"
       FROM reembolso_items ri JOIN productos p ON p.id = ri.producto_id
      WHERE ri.reembolso_id = ANY($1::int[]) ORDER BY ri.id`,
    [reembolsos.map((r) => r.id)]
  );
  return reembolsos.map((r) => ({
    ...r,
    items: items.filter((i) => i.reembolsoId === r.id).map(({ reembolsoId, ...resto }) => resto)
  }));
}

/** Abonos (pagos recibidos) de una venta a Debe, del más antiguo al más reciente. */
async function obtenerAbonos(db, ventaId) {
  const { rows } = await db.query(
    `SELECT a.id, a.tipo, a.metodo_pago AS "metodoPago", a.billetera, a.monto, a.observacion, a.created_at AS fecha,
            a.usuario_id AS "usuarioId", u.nombre AS "usuarioNombre"
       FROM abonos a JOIN usuarios u ON u.id = a.usuario_id
      WHERE a.venta_id = $1 ORDER BY a.created_at, a.id`,
    [ventaId]
  );
  return rows;
}

/** Suma de lo abonado a la venta (abono inicial + abonos posteriores). */
async function totalAbonado(db, ventaId) {
  const { rows } = await db.query('SELECT COALESCE(SUM(monto), 0) AS total FROM abonos WHERE venta_id = $1', [ventaId]);
  return rows[0].total;
}

/** Venta completa para factura / detalle: encabezado + ítems + reembolsos + abonos. */
async function detalle(db, id) {
  const venta = await obtenerPorId(db, id);
  if (!venta) return null;
  const [items, reembolsos, abonos] = await Promise.all([
    obtenerItems(db, id), obtenerReembolsos(db, id), obtenerAbonos(db, id)
  ]);
  // Cada reembolso se desglosa con los abonos que existían cuando se hizo (reduce la deuda vs. se devuelve).
  let acumulado = 0;
  const reembolsosDesglosados = reembolsos.map((r) => {
    const abonado = redondear(abonos.filter((a) => new Date(a.fecha) <= new Date(r.fecha)).reduce((s, a) => s + a.monto, 0));
    const desglose = desgloseReembolso({
      metodoPago: venta.metodoPago, total: venta.total, abonado, reembolsadoPrevio: acumulado, monto: r.monto
    });
    acumulado = redondear(acumulado + r.monto);
    return { ...r, reduceDeuda: desglose.reduceDeuda, devuelto: desglose.devuelto };
  });
  const devueltoTotal = redondear(reembolsosDesglosados.reduce((s, r) => s + r.devuelto, 0));
  return {
    ...venta,
    abonos,
    descuento: venta.descuentoNombre
      ? { id: venta.descuentoId, nombre: venta.descuentoNombre, tipo: venta.descuentoTipo, valor: venta.descuentoValor, monto: venta.descuentoMonto }
      : null,
    items,
    reembolsos: reembolsosDesglosados,
    totalReembolsado: reembolsos.reduce((suma, r) => suma + r.monto, 0),
    // Dinero que hay que devolver al cliente (reembolsos que superan lo que debía en ventas a Debe).
    totalDevuelto: devueltoTotal
  };
}

/** Historial con filtros: estado, metodoPago, clienteId, desde, hasta (AAAA-MM-DD). */
async function listar({ estado, metodoPago, clienteId, desde, hasta, limit, offset }) {
  const { pool } = require('../config/db');
  const params = [];
  const condiciones = [];
  if (estado) { params.push(estado); condiciones.push(`v.estado = $${params.length}`); }
  if (metodoPago) { params.push(metodoPago); condiciones.push(`v.metodo_pago = $${params.length}`); }
  if (clienteId) { params.push(clienteId); condiciones.push(`v.cliente_id = $${params.length}`); }
  condiciones.push(...condicionesRango('COALESCE(v.cerrada_en, v.created_at)', desde, hasta, params));

  const pag = paginacion(limit, offset);
  params.push(pag.limit, pag.offset);
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `${SELECT_VENTA} ${where}
      ORDER BY COALESCE(v.cerrada_en, v.created_at) DESC, v.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

module.exports = { obtenerPorId, obtenerItems, obtenerReembolsos, obtenerAbonos, totalAbonado, detalle, listar };
