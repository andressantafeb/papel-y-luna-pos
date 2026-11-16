const { withTransaction, pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { notFound } = require('../utils/httpError');
const { idParam, idOpcional, itemsCantidad, opcion, fecha, numero } = require('../utils/validators');
const ventaModel = require('../models/ventaModel');
const ventaService = require('../services/ventaService');

const { METODOS_PAGO: METODOS, METODOS_ABONO } = require('../utils/metodosPago');

// Un cajero solo ve/modifica sus propias ventas abiertas; el administrador, todas.
function verificarPropiedad(req, venta) {
  if (venta.estado === 'abierta' && req.usuario.rol !== 'administrador' && venta.usuarioId !== req.usuario.id) {
    // 404 a propósito: no revela que la venta existe.
    throw notFound('La venta no existe.');
  }
}

async function ventaOrNotFound(req, id) {
  const venta = await ventaModel.detalle(pool, id);
  if (!venta) throw notFound('La venta no existe.');
  verificarPropiedad(req, venta);
  return venta;
}

// GET /api/ventas?estado=&metodoPago=&clienteId=&desde=&hasta=&limit=&offset=
const listar = asyncHandler(async (req, res) => {
  const { estado, metodoPago, clienteId, desde, hasta, limit, offset } = req.query;
  const filtros = {
    estado: estado ? opcion(estado, 'estado', ['abierta', 'cerrada']) : null,
    metodoPago: metodoPago ? opcion(metodoPago, 'metodoPago', METODOS) : null,
    clienteId: clienteId ? idParam(clienteId, 'clienteId') : null,
    desde: fecha(desde, 'desde'),
    hasta: fecha(hasta, 'hasta'),
    limit,
    offset
  };
  let ventas = await ventaModel.listar(filtros);
  if (req.usuario.rol !== 'administrador') {
    // El cajero ve el historial de cerradas, pero de las abiertas solo las suyas.
    ventas = ventas.filter((v) => v.estado === 'cerrada' || v.usuarioId === req.usuario.id);
  }
  res.json(ventas);
});

// GET /api/ventas/:id  (detalle y factura)
const obtener = asyncHandler(async (req, res) => {
  res.json(await ventaOrNotFound(req, idParam(req.params.id)));
});

// POST /api/ventas  { items?, clienteId?, descuentoId? } -> crea una venta abierta
const crear = asyncHandler(async (req, res) => {
  const items = itemsCantidad(req.body?.items ?? [], { permitirVacio: true });
  const clienteId = idOpcional(req.body?.clienteId, 'clienteId');
  const descuentoId = idOpcional(req.body?.descuentoId, 'descuentoId');

  const id = await withTransaction((client) =>
    ventaService.crearAbierta(client, req.usuario, { items, clienteId, descuentoId })
  );
  res.status(201).json(await ventaModel.detalle(pool, id));
});

// PUT /api/ventas/:id  { items?, clienteId?, descuentoId? } -> actualiza una venta abierta
const actualizar = asyncHandler(async (req, res) => {
  const id = idParam(req.params.id);
  await ventaOrNotFound(req, id);
  const datos = {
    items: req.body?.items !== undefined ? itemsCantidad(req.body.items, { permitirVacio: true }) : undefined,
    clienteId: idOpcional(req.body?.clienteId, 'clienteId'),
    descuentoId: idOpcional(req.body?.descuentoId, 'descuentoId')
  };
  await withTransaction((client) => ventaService.actualizarAbierta(client, id, datos));
  res.json(await ventaModel.detalle(pool, id));
});

// DELETE /api/ventas/:id -> descarta una venta abierta (las cerradas no se eliminan)
const descartar = asyncHandler(async (req, res) => {
  const id = idParam(req.params.id);
  await ventaOrNotFound(req, id);
  await withTransaction((client) => ventaService.descartarAbierta(client, id));
  res.json({ mensaje: 'Venta descartada.' });
});

// Abono inicial (solo ventas a Debe): { abonoInicial?: número >= 0, metodoAbono?: Efectivo|Transferencia|Tarjeta }
// y billetera/banco opcional (Transferencia; su formato lo valida resolverPago).
function leerAbonoInicial(body) {
  const abonoInicial = body.abonoInicial === undefined ? undefined : numero(body.abonoInicial, 'abonoInicial', { min: 0, requerido: false }) ?? 0;
  const metodoAbono = body.metodoAbono === undefined || body.metodoAbono === null || body.metodoAbono === ''
    ? undefined
    : opcion(body.metodoAbono, 'metodoAbono', METODOS_ABONO);
  return { abonoInicial, metodoAbono, billetera: body.billetera };
}

// POST /api/ventas/:id/cerrar  { metodoPago, recibido?, clienteId?, billetera?, abonoInicial?, metodoAbono? }
const cerrar = asyncHandler(async (req, res) => {
  const id = idParam(req.params.id);
  await ventaOrNotFound(req, id);
  const pago = {
    metodoPago: opcion(req.body?.metodoPago, 'metodoPago', METODOS),
    recibido: req.body?.recibido,
    clienteId: idOpcional(req.body?.clienteId, 'clienteId'),
    ...leerAbonoInicial(req.body || {})
  };
  await withTransaction((client) => ventaService.cerrar(client, req.usuario, id, pago));
  res.json(await ventaModel.detalle(pool, id));
});

// PUT /api/ventas/:id/correccion  { items?, clienteId?, metodoPago?, recibido?, descuentoId? } (administrador)
const corregir = asyncHandler(async (req, res) => {
  const id = idParam(req.params.id);
  const body = req.body || {};
  const datos = {
    items: body.items !== undefined ? itemsCantidad(body.items) : undefined,
    clienteId: idOpcional(body.clienteId, 'clienteId'),
    descuentoId: idOpcional(body.descuentoId, 'descuentoId'),
    metodoPago: body.metodoPago !== undefined ? opcion(body.metodoPago, 'metodoPago', METODOS) : undefined,
    recibido: body.recibido,
    ...leerAbonoInicial(body)
  };
  await withTransaction((client) => ventaService.corregir(client, req.usuario, id, datos));
  res.json(await ventaModel.detalle(pool, id));
});

module.exports = { listar, obtener, crear, actualizar, descartar, cerrar, corregir };
