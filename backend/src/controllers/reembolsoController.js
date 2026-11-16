const { withTransaction, pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { notFound, badRequest } = require('../utils/httpError');
const { idParam, texto } = require('../utils/validators');
const ventaModel = require('../models/ventaModel');
const reembolsoService = require('../services/reembolsoService');

// POST /api/ventas/:id/reembolsos/previsualizar -> monto a reembolsar sin registrar nada
const previsualizar = asyncHandler(async (req, res) => {
  const id = idParam(req.params.id);
  const solicitud = reembolsoService.leerSolicitud(req.body);
  res.json(await withTransaction((client) => reembolsoService.previsualizar(client, id, solicitud)));
});

// POST /api/ventas/:id/reembolsos
//   { tipo: "total", retornaInventario }
//   { tipo: "parcial", items: [{ productoId, cantidad, retornaInventario }], observacion? }
const registrar = asyncHandler(async (req, res) => {
  const id = idParam(req.params.id);
  const solicitud = reembolsoService.leerSolicitud(req.body);
  const observacion = texto(req.body?.observacion, 'observacion', { requerido: false, max: 300 });

  const { reembolsoId, desglose } = await withTransaction((client) =>
    reembolsoService.registrar(client, req.usuario, id, solicitud, observacion)
  );
  const venta = await ventaModel.detalle(pool, id);
  const reembolso = venta.reembolsos.find((r) => r.id === reembolsoId);
  if (!reembolso) throw badRequest('No se pudo recuperar el reembolso registrado.');
  // `desglose`: cuánto del reembolso redujo la deuda del cliente y cuánto se le debe devolver.
  res.status(201).json({ reembolso, venta, desglose });
});

// GET /api/ventas/:id/reembolsos
const listar = asyncHandler(async (req, res) => {
  const id = idParam(req.params.id);
  const venta = await ventaModel.obtenerPorId(pool, id);
  if (!venta) throw notFound('La venta no existe.');
  res.json(await ventaModel.obtenerReembolsos(pool, id));
});

module.exports = { previsualizar, registrar, listar };
