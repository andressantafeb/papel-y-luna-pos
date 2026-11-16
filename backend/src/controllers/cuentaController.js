const { pool, withTransaction } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { notFound, badRequest } = require('../utils/httpError');
const { idParam, idOpcional, numero, texto, opcion } = require('../utils/validators');
const cuentaModel = require('../models/cuentaModel');
const abonoService = require('../services/abonoService');

const { METODOS_ABONO, BILLETERA_MAX } = require('../utils/metodosPago');

async function clienteOrNotFound(clienteId) {
  const { rows } = await pool.query('SELECT id, nombre, telefono FROM clientes WHERE id = $1', [clienteId]);
  if (!rows.length) throw notFound('El cliente no existe.');
  return rows[0];
}

async function resumenCliente(clienteId) {
  const cliente = await clienteOrNotFound(clienteId);
  const [ventas, abonos] = await Promise.all([
    cuentaModel.ventasConSaldo(pool, clienteId),
    cuentaModel.abonosDeCliente(pool, clienteId)
  ]);
  return { cliente, saldoPendiente: cuentaModel.sumar(ventas, 'saldo'), ventas, abonos };
}

// GET /api/cuentas-por-cobrar -> clientes con saldo pendiente y total de la cartera
const listar = asyncHandler(async (req, res) => {
  const clientes = await cuentaModel.deudores(pool);
  res.json({ totalPorCobrar: cuentaModel.sumar(clientes, 'saldoPendiente'), clientes });
});

// GET /api/cuentas-por-cobrar/clientes/:clienteId -> ventas a Debe con saldo + historial de abonos
const detalleCliente = asyncHandler(async (req, res) => {
  res.json(await resumenCliente(idParam(req.params.clienteId, 'clienteId')));
});

// POST /api/cuentas-por-cobrar/clientes/:clienteId/abonos
//   { monto, metodoPago: Efectivo|Transferencia|Tarjeta, billetera? (solo Transferencia), ventaId?, observacion? }
const registrarAbono = asyncHandler(async (req, res) => {
  const clienteId = idParam(req.params.clienteId, 'clienteId');
  const b = req.body || {};
  const monto = numero(b.monto, 'monto', { min: 0 });
  if (!(monto > 0)) throw badRequest('El abono debe ser mayor a 0.');
  const datos = {
    monto,
    metodoPago: opcion(b.metodoPago, 'metodoPago', METODOS_ABONO),
    ventaId: idOpcional(b.ventaId, 'ventaId') || null,
    observacion: texto(b.observacion, 'observacion', { requerido: false, max: 300 }),
    billetera: texto(b.billetera, 'billetera', { requerido: false, max: BILLETERA_MAX })
  };
  const resultado = await withTransaction((client) => abonoService.registrar(client, req.usuario, clienteId, datos));
  res.status(201).json({ ...resultado, ...(await resumenCliente(clienteId)), saldoPendiente: resultado.saldoPendiente });
});

module.exports = { listar, detalleCliente, registrarAbono };
