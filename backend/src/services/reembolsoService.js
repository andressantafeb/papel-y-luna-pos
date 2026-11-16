const { badRequest, notFound, conflict } = require('../utils/httpError');
const { redondear, entero } = require('../utils/validators');
const { aplicarMovimientos } = require('./inventario');
const ventaModel = require('../models/ventaModel');
const { desgloseReembolso } = require('../utils/reembolsoDesglose');

/** Unidades y monto ya reembolsados por producto en una venta. */
async function unidadesReembolsadas(client, ventaId) {
  const { rows } = await client.query(
    `SELECT ri.producto_id AS "productoId", SUM(ri.cantidad)::int AS cantidad, SUM(ri.monto) AS monto
       FROM reembolso_items ri JOIN reembolsos r ON r.id = ri.reembolso_id
      WHERE r.venta_id = $1 GROUP BY ri.producto_id`,
    [ventaId]
  );
  return new Map(rows.map((r) => [r.productoId, r]));
}

/**
 * Calcula el reembolso sin escribir nada (sirve para la vista previa, RF-62, y para registrar).
 * `solicitud`:
 *   { total: true, retornaInventario }  -> todas las unidades pendientes de reembolsar
 *   { items: [{ productoId, cantidad, retornaInventario }] }  -> parcial
 */
async function calcular(client, ventaId, solicitud) {
  const venta = await ventaModel.obtenerPorId(client, ventaId, { bloquear: true });
  if (!venta) throw notFound('La venta no existe.');
  if (venta.estado !== 'cerrada') throw conflict('Solo se pueden reembolsar productos de ventas cerradas.');

  const items = await ventaModel.obtenerItems(client, ventaId);
  const previos = await unidadesReembolsadas(client, ventaId);
  const disponibles = new Map(
    items.map((i) => [i.productoId, { ...i, pendiente: i.cantidad - (previos.get(i.productoId)?.cantidad || 0) }])
  );

  const seleccion = solicitud.total
    ? [...disponibles.values()]
      .filter((i) => i.pendiente > 0)
      .map((i) => ({ productoId: i.productoId, cantidad: i.pendiente, retornaInventario: solicitud.retornaInventario }))
    : solicitud.items;
  if (!seleccion.length) throw conflict('No hay productos pendientes de reembolso en esta venta.');

  // Proporción del descuento: cada línea se reembolsa respetando el descuento de la venta.
  const factor = venta.subtotal > 0 ? venta.total / venta.subtotal : 1;

  const lineas = seleccion.map((s) => {
    const linea = disponibles.get(s.productoId);
    if (!linea) throw badRequest(`El producto ${s.productoId} no hace parte de la venta.`);
    if (s.cantidad > linea.pendiente) {
      throw conflict(
        `No se pueden reembolsar ${s.cantidad} unidad(es) de "${linea.nombre}": solo quedan ${linea.pendiente} por reembolsar.`
      );
    }
    return {
      productoId: s.productoId,
      nombre: linea.nombre,
      cantidad: s.cantidad,
      retornaInventario: Boolean(s.retornaInventario),
      monto: redondear(linea.precio * s.cantidad * factor)
    };
  });

  // Si con este reembolso se completa la venta, el monto cierra exacto contra el total
  // (evita descuadres por redondeo del descuento proporcional).
  const completa = [...disponibles.values()].every((i) => {
    const solicitado = lineas.find((l) => l.productoId === i.productoId)?.cantidad || 0;
    return i.pendiente - solicitado === 0;
  });
  let monto = redondear(lineas.reduce((suma, l) => suma + l.monto, 0));
  if (completa) {
    const yaReembolsado = redondear([...previos.values()].reduce((suma, p) => suma + p.monto, 0));
    const restante = redondear(venta.total - yaReembolsado);
    lineas[lineas.length - 1].monto = redondear(lineas[lineas.length - 1].monto + (restante - monto));
    monto = restante;
  }

  // Qué parte del monto baja la deuda del cliente y cuál se le devuelve (ventas a Debe con abonos).
  const reembolsadoPrevio = redondear([...previos.values()].reduce((suma, p) => suma + p.monto, 0));
  const desglose = desgloseReembolso({
    metodoPago: venta.metodoPago,
    total: venta.total,
    abonado: await ventaModel.totalAbonado(client, ventaId), // consulta nueva: ve abonos confirmados mientras se esperaba el bloqueo
    reembolsadoPrevio,
    monto
  });
  return { venta, lineas, monto, completa, desglose };
}

/** Vista previa del monto a reembolsar (no modifica datos). */
async function previsualizar(client, ventaId, solicitud) {
  const { venta, lineas, monto, completa, desglose } = await calcular(client, ventaId, solicitud);
  return { monto, completa, items: lineas, esDebe: venta.metodoPago === 'Debe', ...desglose };
}

/** Registra el reembolso, devuelve stock si corresponde y actualiza el estado de la venta. */
async function registrar(client, usuario, ventaId, solicitud, observacion) {
  const { lineas, monto, completa, desglose } = await calcular(client, ventaId, solicitud);

  const { rows } = await client.query(
    `INSERT INTO reembolsos (venta_id, usuario_id, monto, observacion)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [ventaId, usuario.id, monto, observacion || null]
  );
  const reembolsoId = rows[0].id;

  for (const l of lineas) {
    await client.query(
      `INSERT INTO reembolso_items (reembolso_id, producto_id, cantidad, monto, retorna_inventario)
       VALUES ($1, $2, $3, $4, $5)`,
      [reembolsoId, l.productoId, l.cantidad, l.monto, l.retornaInventario]
    );
  }

  // Solo suma stock lo que se indicó que retorna al inventario (3.9).
  await aplicarMovimientos(
    client,
    lineas.filter((l) => l.retornaInventario).map((l) => ({ productoId: l.productoId, delta: l.cantidad })),
    { tipo: 'reembolso', ventaId, reembolsoId, usuarioId: usuario.id, nota: `Reembolso #${reembolsoId} de la venta #${ventaId}` }
  );

  await client.query(
    'UPDATE ventas SET estado_reembolso = $2, updated_at = NOW() WHERE id = $1',
    [ventaId, completa ? 'total' : 'parcial']
  );
  return { reembolsoId, desglose };
}

/** Valida y normaliza el cuerpo de la petición de reembolso. */
function leerSolicitud(body) {
  if (body?.tipo === 'total') {
    return { total: true, retornaInventario: body.retornaInventario === true };
  }
  if (body?.tipo !== 'parcial') throw badRequest('El campo "tipo" debe ser "total" o "parcial".');
  if (!Array.isArray(body.items) || !body.items.length) {
    throw badRequest('Selecciona al menos un producto a reembolsar.');
  }
  const vistos = new Set();
  const items = body.items.map((item, i) => {
    const productoId = entero(item?.productoId, `items[${i}].productoId`, { min: 1 });
    const cantidad = entero(item?.cantidad, `items[${i}].cantidad`, { min: 1 });
    if (typeof item.retornaInventario !== 'boolean') {
      throw badRequest(`Indica si el producto ${productoId} retorna al inventario (items[${i}].retornaInventario).`);
    }
    if (vistos.has(productoId)) throw badRequest(`El producto ${productoId} está repetido.`);
    vistos.add(productoId);
    return { productoId, cantidad, retornaInventario: item.retornaInventario };
  });
  return { total: false, items };
}

module.exports = { previsualizar, registrar, leerSolicitud };
