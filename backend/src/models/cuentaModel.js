const { redondear } = require('../utils/validators');

// Saldo de cada venta a Debe cerrada: total - abonos (inicial + posteriores) - reembolsos, nunca menor a 0.
const SALDOS_VENTA = `
  SELECT v.id AS "ventaId", v.cliente_id AS "clienteId", v.total, v.cerrada_en AS fecha,
         v.abono_inicial AS "abonoInicial",
         COALESCE(a.abonado, 0) AS abonado, COALESCE(r.reembolsado, 0) AS reembolsado,
         GREATEST(0, v.total - COALESCE(a.abonado, 0) - COALESCE(r.reembolsado, 0)) AS saldo
    FROM ventas v
    LEFT JOIN (SELECT venta_id, SUM(monto) AS abonado FROM abonos GROUP BY venta_id) a ON a.venta_id = v.id
    LEFT JOIN (SELECT venta_id, SUM(monto) AS reembolsado FROM reembolsos GROUP BY venta_id) r ON r.venta_id = v.id
   WHERE v.estado = 'cerrada' AND v.metodo_pago = 'Debe'`;

/** Clientes con saldo pendiente, de mayor a menor deuda. */
async function deudores(db) {
  const { rows } = await db.query(
    `WITH s AS (${SALDOS_VENTA})
     SELECT c.id AS "clienteId", c.nombre, c.telefono,
            COUNT(*)::int AS "ventasPendientes", SUM(s.saldo) AS "saldoPendiente", MIN(s.fecha) AS "deudaDesde"
       FROM s JOIN clientes c ON c.id = s."clienteId"
      WHERE s.saldo > 0
      GROUP BY c.id, c.nombre, c.telefono
      ORDER BY "saldoPendiente" DESC, c.nombre`
  );
  return rows;
}

/** Ventas a Debe de un cliente con su saldo, de la más antigua a la más reciente (orden en que se aplican los abonos). */
async function ventasConSaldo(db, clienteId, { ventaId = null } = {}) {
  const params = [clienteId];
  let filtro = '';
  if (ventaId) { params.push(ventaId); filtro = `AND s."ventaId" = $${params.length}`; }
  const { rows } = await db.query(
    `WITH s AS (${SALDOS_VENTA})
     SELECT * FROM s WHERE s."clienteId" = $1 AND s.saldo > 0 ${filtro} ORDER BY s.fecha, s."ventaId"`,
    params
  );
  return rows;
}

/** Bloquea las ventas a Debe del cliente para serializar pagos concurrentes (usar dentro de una transacción). */
async function bloquearVentasDebe(client, clienteId) {
  await client.query(
    `SELECT id FROM ventas WHERE cliente_id = $1 AND estado = 'cerrada' AND metodo_pago = 'Debe'
      ORDER BY cerrada_en, id FOR UPDATE`,
    [clienteId]
  );
}

/** Historial de abonos de un cliente (más recientes primero). */
async function abonosDeCliente(db, clienteId, limite = 100) {
  const { rows } = await db.query(
    `SELECT a.id, a.venta_id AS "ventaId", a.tipo, a.metodo_pago AS "metodoPago", a.billetera, a.monto, a.observacion,
            a.created_at AS fecha, u.nombre AS "usuarioNombre"
       FROM abonos a JOIN usuarios u ON u.id = a.usuario_id
      WHERE a.cliente_id = $1 ORDER BY a.created_at DESC, a.id DESC LIMIT $2`,
    [clienteId, limite]
  );
  return rows;
}

const sumar = (filas, campo) => redondear(filas.reduce((suma, f) => suma + f[campo], 0));

module.exports = { deudores, ventasConSaldo, bloquearVentasDebe, abonosDeCliente, sumar };
