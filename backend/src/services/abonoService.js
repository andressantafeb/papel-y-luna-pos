const { badRequest, notFound, conflict } = require('../utils/httpError');
const { redondear } = require('../utils/validators');
const cuentaModel = require('../models/cuentaModel');
const { METODOS_ABONO } = require('../utils/metodosPago');

/**
 * Registra un pago (abono) de un cliente sobre sus ventas a Debe. Todo en la transacción recibida.
 *  - Con `ventaId`: el pago se aplica solo a esa venta y no puede superar su saldo.
 *  - Sin `ventaId`: se aplica a las ventas con saldo de la más antigua a la más reciente.
 * Cada aplicación queda como una fila del libro `abonos` (movimiento financiero con método de pago).
 * El saldo pendiente no se guarda: se calcula (total - abonos - reembolsos), así nunca se desincroniza.
 */
async function registrar(client, usuario, clienteId, { monto, metodoPago, ventaId, observacion, billetera }) {
  // Defensa en profundidad: el servicio también rechaza métodos fuera de Efectivo, Transferencia o Tarjeta.
  if (!METODOS_ABONO.includes(metodoPago)) {
    throw badRequest(`El método del abono debe ser uno de: ${METODOS_ABONO.join(', ')}.`);
  }
  const { rows } = await client.query('SELECT id FROM clientes WHERE id = $1 FOR UPDATE', [clienteId]);
  if (!rows.length) throw notFound('El cliente no existe.');
  // Serializa pagos simultáneos del mismo cliente para no pasarse del saldo.
  await cuentaModel.bloquearVentasDebe(client, clienteId);

  const ventas = await cuentaModel.ventasConSaldo(client, clienteId, { ventaId });
  if (ventaId && !ventas.length) {
    throw conflict('Esa venta no pertenece al cliente, no es a Debe o ya no tiene saldo pendiente.');
  }
  const saldoTotal = cuentaModel.sumar(ventas, 'saldo');
  if (!ventas.length) throw conflict('El cliente no tiene saldo pendiente.');
  if (monto > saldoTotal) {
    throw conflict(`El abono (${monto}) supera el saldo pendiente (${saldoTotal}). Registra un valor menor o igual al saldo.`);
  }

  const aplicados = [];
  let restante = monto;
  for (const v of ventas) {
    if (restante <= 0) break;
    const aplicar = redondear(Math.min(restante, v.saldo));
    const { rows: ins } = await client.query(
      `INSERT INTO abonos (venta_id, cliente_id, tipo, metodo_pago, monto, usuario_id, observacion, billetera)
       VALUES ($1, $2, 'posterior', $3, $4, $5, $6, $7) RETURNING id`,
      [v.ventaId, clienteId, metodoPago, aplicar, usuario.id, observacion || null,
        metodoPago === 'Transferencia' ? billetera || null : null]
    );
    aplicados.push({ abonoId: ins[0].id, ventaId: v.ventaId, monto: aplicar, saldoRestante: redondear(v.saldo - aplicar) });
    restante = redondear(restante - aplicar);
  }
  if (restante > 0) throw badRequest('No se pudo aplicar el abono completo.'); // no debería ocurrir; revierte la transacción
  return { aplicados, saldoAnterior: saldoTotal, saldoPendiente: redondear(saldoTotal - monto) };
}

module.exports = { registrar };
