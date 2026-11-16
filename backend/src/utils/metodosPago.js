// Métodos de pago válidos: única fuente de verdad del backend (ventas, abonos y reportes la comparten).
const METODOS_PAGO = Object.freeze(['Efectivo', 'Transferencia', 'Tarjeta', 'Debe']);

// Con qué se puede pagar un abono (es dinero que entra): todos los métodos menos "Debe".
const METODOS_ABONO = Object.freeze(['Efectivo', 'Transferencia', 'Tarjeta']);

// Largo máximo de la billetera o banco de una transferencia (texto libre y opcional: Itaú, Daviplata, Nu...).
const BILLETERA_MAX = 60;

module.exports = { METODOS_PAGO, METODOS_ABONO, BILLETERA_MAX };
