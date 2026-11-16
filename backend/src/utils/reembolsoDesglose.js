const { redondear } = require('./validators');

/**
 * Desglosa un reembolso en lo que reduce la deuda del cliente y lo que se le devuelve.
 *  - Venta que no es a Debe: se pagó completa al cerrar, así que todo el monto se devuelve.
 *  - Venta a Debe: el saldo pendiente es total - abonado - reembolsado (nunca menor a 0). El reembolso primero baja
 *    ese saldo; si el cliente ya había abonado más de lo que le corresponde pagar, el excedente se le devuelve.
 *    Ejemplo: total 100, abonado 60 (saldo 40). Reembolsar 50 reduce la deuda 40 y devuelve 10.
 * Es una función pura: usa solo datos que ya existen, por eso no requiere columnas nuevas.
 */
function desgloseReembolso({ metodoPago, total, abonado, reembolsadoPrevio, monto }) {
  if (metodoPago !== 'Debe') {
    return { reduceDeuda: 0, devuelto: redondear(monto), saldoAntes: 0, saldoDespues: 0 };
  }
  const base = Number(total) - Number(abonado) - Number(reembolsadoPrevio);
  const saldoAntes = Math.max(0, redondear(base));
  const saldoDespues = Math.max(0, redondear(base - monto));
  const reduceDeuda = redondear(saldoAntes - saldoDespues);
  return { reduceDeuda, devuelto: Math.max(0, redondear(monto - reduceDeuda)), saldoAntes, saldoDespues };
}

module.exports = { desgloseReembolso };
