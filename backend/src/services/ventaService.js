const { badRequest, notFound, conflict } = require('../utils/httpError');
const { aplicarMovimientos } = require('./inventario');
const ventaModel = require('../models/ventaModel');
const {
  construirLineas, cargarDescuento, calcularTotales, verificarCliente,
  resolverPago, reemplazarLineas, snapshotDescuento
} = require('./ventaCalculo');

/* ------------------------------------------------------------------ */
/* Venta abierta: crear, actualizar, descartar                        */
/* ------------------------------------------------------------------ */

async function crearAbierta(client, usuario, { items, clienteId, descuentoId }) {
  await verificarCliente(client, clienteId);
  const lineas = await construirLineas(client, items);
  const descuento = lineas.length && descuentoId ? await cargarDescuento(client, descuentoId) : null;
  const totales = calcularTotales(lineas, descuento);
  const d = snapshotDescuento(descuento);

  const { rows } = await client.query(
    `INSERT INTO ventas (estado, cliente_id, descuento_id, descuento_nombre, descuento_tipo, descuento_valor,
                         subtotal, descuento_monto, iva_porcentaje, iva_monto, total, usuario_id)
     VALUES ('abierta', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [clienteId || null, d.id, d.nombre, d.tipo, d.valor, totales.subtotal, totales.descuentoMonto,
      totales.ivaPorcentaje, totales.ivaMonto, totales.total, usuario.id]
  );
  await reemplazarLineas(client, rows[0].id, lineas);
  return rows[0].id;
}

async function obtenerAbiertaBloqueada(client, ventaId) {
  const venta = await ventaModel.obtenerPorId(client, ventaId, { bloquear: true });
  if (!venta) throw notFound('La venta no existe.');
  if (venta.estado !== 'abierta') {
    throw conflict('La venta ya está cerrada. Para modificarla usa la corrección de ventas cerradas.');
  }
  return venta;
}

/** Actualiza una venta abierta. Los precios se refrescan con los vigentes (RN-02, RF-87). */
async function actualizarAbierta(client, ventaId, { items, clienteId, descuentoId }) {
  const venta = await obtenerAbiertaBloqueada(client, ventaId);

  const itemsFinales = items !== undefined
    ? items
    : (await ventaModel.obtenerItems(client, ventaId)).map((i) => ({ productoId: i.productoId, cantidad: i.cantidad }));
  const clienteFinal = clienteId !== undefined ? clienteId : venta.clienteId;
  const descuentoFinalId = descuentoId !== undefined ? descuentoId : venta.descuentoId;

  await verificarCliente(client, clienteFinal);
  const lineas = await construirLineas(client, itemsFinales);
  const descuento = lineas.length && descuentoFinalId ? await cargarDescuento(client, descuentoFinalId) : null;
  const totales = calcularTotales(lineas, descuento);
  const d = snapshotDescuento(descuento);

  await client.query(
    `UPDATE ventas SET cliente_id = $2, descuento_id = $3, descuento_nombre = $4, descuento_tipo = $5,
            descuento_valor = $6, subtotal = $7, descuento_monto = $8, iva_porcentaje = $9, iva_monto = $10, total = $11,
            updated_at = NOW()
      WHERE id = $1`,
    [ventaId, clienteFinal || null, d.id, d.nombre, d.tipo, d.valor, totales.subtotal, totales.descuentoMonto,
      totales.ivaPorcentaje, totales.ivaMonto, totales.total]
  );
  await reemplazarLineas(client, ventaId, lineas);
}

/** Descarta una venta abierta (RF-16). Las ventas cerradas no se eliminan (fuera de alcance). */
async function descartarAbierta(client, ventaId) {
  await obtenerAbiertaBloqueada(client, ventaId);
  await client.query('DELETE FROM ventas WHERE id = $1', [ventaId]);
}

/* ------------------------------------------------------------------ */
/* Cierre de venta                                                    */
/* ------------------------------------------------------------------ */

/**
 * Cierra una venta abierta (RF-24): recalcula con precios vigentes, valida el pago,
 * descuenta stock (rechaza si quedaría negativo) y marca la venta como cerrada.
 * Todo en la misma transacción.
 */
async function cerrar(client, usuario, ventaId, pago) {
  const venta = await obtenerAbiertaBloqueada(client, ventaId);
  const items = (await ventaModel.obtenerItems(client, ventaId)).map((i) => ({ productoId: i.productoId, cantidad: i.cantidad }));
  if (!items.length) throw badRequest('No se puede cerrar una venta sin productos.'); // RN-01

  const clienteFinal = pago.clienteId !== undefined && pago.clienteId !== null ? pago.clienteId : venta.clienteId;
  await verificarCliente(client, clienteFinal);

  const lineas = await construirLineas(client, items);
  let descuento = null;
  if (venta.descuentoId) {
    descuento = await cargarDescuento(client, venta.descuentoId);
  } else if (venta.descuentoNombre) {
    // El descuento se eliminó del catálogo después de aplicarse: se respeta la copia guardada.
    descuento = { id: null, nombre: venta.descuentoNombre, tipo: venta.descuentoTipo, valor: venta.descuentoValor };
  }
  const totales = calcularTotales(lineas, descuento);
  // El total con IVA que vio el cajero debe ser el recalculado: si cambiaron precios o descuento, no se cobra a ciegas.
  if (pago.totalEsperado !== undefined && pago.totalEsperado !== null && Math.abs(pago.totalEsperado - totales.total) > 0.009) {
    throw conflict(`El total de la venta cambió a ${totales.total} (precios o descuento actualizados). Cierra el cobro, revisa el ticket y vuelve a intentarlo.`);
  }
  const cobro = resolverPago({ ...pago, clienteId: clienteFinal }, totales.total);
  const d = snapshotDescuento(descuento);

  await aplicarMovimientos(
    client,
    lineas.map((l) => ({ productoId: l.productoId, delta: -l.cantidad })),
    { tipo: 'venta', ventaId, usuarioId: usuario.id, nota: `Venta #${ventaId}` }
  );
  await reemplazarLineas(client, ventaId, lineas);
  await client.query(
    `UPDATE ventas SET estado = 'cerrada', cliente_id = $2, metodo_pago = $3, recibido = $4, cambio = $5,
            descuento_id = $6, descuento_nombre = $7, descuento_tipo = $8, descuento_valor = $9,
            subtotal = $10, descuento_monto = $11, iva_porcentaje = $12, iva_monto = $13, total = $14,
            abono_inicial = $15, metodo_abono = $16, billetera = $17, cerrada_en = NOW(), updated_at = NOW()
      WHERE id = $1`,
    [ventaId, clienteFinal || null, cobro.metodoPago, cobro.recibido, cobro.cambio,
      d.id, d.nombre, d.tipo, d.valor, totales.subtotal, totales.descuentoMonto, totales.ivaPorcentaje, totales.ivaMonto,
      totales.total,
      cobro.abonoInicial, cobro.metodoAbono, cobro.billetera]
  );
  await registrarAbonoInicial(client, usuario, ventaId, clienteFinal, cobro);
}

/** Si la venta a Debe se cerró con abono inicial, lo deja en el libro de abonos (movimiento financiero). */
async function registrarAbonoInicial(client, usuario, ventaId, clienteId, cobro) {
  if (!(cobro.abonoInicial > 0)) return;
  await client.query(
    `INSERT INTO abonos (venta_id, cliente_id, tipo, metodo_pago, monto, usuario_id, observacion, billetera)
     VALUES ($1, $2, 'inicial', $3, $4, $5, 'Abono inicial al cerrar la venta', $6)`,
    [ventaId, clienteId, cobro.metodoAbono, cobro.abonoInicial, usuario.id, cobro.billetera]
  );
}

/* ------------------------------------------------------------------ */
/* Corrección de ventas cerradas (RF-50, RN-06)                       */
/* ------------------------------------------------------------------ */

async function corregir(client, usuario, ventaId, datos) {
  const venta = await ventaModel.obtenerPorId(client, ventaId, { bloquear: true });
  if (!venta) throw notFound('La venta no existe.');
  if (venta.estado !== 'cerrada') throw conflict('Solo se pueden corregir ventas cerradas.');
  if (venta.estadoReembolso !== 'ninguno') {
    throw conflict('No se puede corregir una venta que ya tiene reembolsos.');
  }

  const itemsOriginales = await ventaModel.obtenerItems(client, ventaId);
  const preciosPrevios = new Map(itemsOriginales.map((i) => [i.productoId, i.precio]));
  const itemsNuevos = datos.items !== undefined
    ? datos.items
    : itemsOriginales.map((i) => ({ productoId: i.productoId, cantidad: i.cantidad }));
  if (!itemsNuevos.length) throw badRequest('La venta corregida debe tener al menos un producto.');

  const clienteFinal = datos.clienteId !== undefined ? datos.clienteId : venta.clienteId;
  await verificarCliente(client, clienteFinal);

  // Las líneas existentes conservan su precio original; las nuevas usan el precio vigente.
  const lineas = await construirLineas(client, itemsNuevos, preciosPrevios);

  // Descuento: si no cambia se conserva la copia original (aunque ya no exista en el catálogo).
  const copiaOriginal = venta.descuentoNombre
    ? { id: venta.descuentoId, nombre: venta.descuentoNombre, tipo: venta.descuentoTipo, valor: venta.descuentoValor }
    : null;
  let descuento;
  if (datos.descuentoId === undefined || (datos.descuentoId !== null && datos.descuentoId === venta.descuentoId)) {
    descuento = copiaOriginal;
  } else {
    descuento = datos.descuentoId === null ? null : await cargarDescuento(client, datos.descuentoId);
  }
  const totales = calcularTotales(lineas, descuento);

  const metodoFinal = datos.metodoPago !== undefined ? datos.metodoPago : venta.metodoPago;
  const recibidoFinal = datos.recibido !== undefined ? datos.recibido : venta.recibido;
  // La billetera o banco se conserva si el método no cambia y la corrección no envía una nueva.
  const billeteraFinal = datos.billetera !== undefined
    ? datos.billetera
    : (metodoFinal === venta.metodoPago ? venta.billetera : undefined);

  // Ventas a Debe que ya recibieron abonos: el dinero ya está en caja y ligado al cliente,
  // así que no se puede cambiar el método, el cliente ni dejar el total por debajo de lo abonado.
  const abonado = await ventaModel.totalAbonado(client, ventaId);
  let cobro;
  if (abonado > 0) {
    if (metodoFinal !== 'Debe') {
      throw conflict('La venta tiene abonos registrados: no se puede cambiar el método de pago. Reembolsa o gestiona los abonos primero.');
    }
    if (clienteFinal !== venta.clienteId) {
      throw conflict('La venta tiene abonos registrados: no se puede cambiar el cliente.');
    }
    if (datos.abonoInicial !== undefined && datos.abonoInicial !== null && Number(datos.abonoInicial) !== venta.abonoInicial) {
      throw conflict('La venta ya tiene abonos registrados: no se puede modificar el abono inicial.');
    }
    if (totales.total < abonado) {
      throw conflict(`El nuevo total (${totales.total}) no puede ser menor a lo ya abonado (${abonado}).`);
    }
    cobro = {
      metodoPago: 'Debe', recibido: null, cambio: 0,
      abonoInicial: venta.abonoInicial, metodoAbono: venta.metodoAbono, billetera: venta.billetera
    };
  } else {
    cobro = resolverPago({
      metodoPago: metodoFinal, recibido: recibidoFinal, clienteId: clienteFinal,
      abonoInicial: datos.abonoInicial, metodoAbono: datos.metodoAbono, billetera: billeteraFinal
    }, totales.total);
  }

  // Ajuste de inventario = diferencia entre lo vendido originalmente y lo corregido.
  const cambios = [];
  itemsOriginales.forEach((i) => cambios.push({ productoId: i.productoId, delta: i.cantidad }));
  lineas.forEach((l) => cambios.push({ productoId: l.productoId, delta: -l.cantidad }));
  await aplicarMovimientos(client, cambios, {
    tipo: 'correccion', ventaId, usuarioId: usuario.id, nota: `Corrección de la venta #${ventaId}`
  });

  const d = snapshotDescuento(descuento);
  await reemplazarLineas(client, ventaId, lineas);
  await client.query(
    `UPDATE ventas SET cliente_id = $2, metodo_pago = $3, recibido = $4, cambio = $5,
            descuento_id = $6, descuento_nombre = $7, descuento_tipo = $8, descuento_valor = $9,
            subtotal = $10, descuento_monto = $11, iva_porcentaje = $12, iva_monto = $13, total = $14,
            abono_inicial = $15, metodo_abono = $16, billetera = $17,
            corregida = TRUE, corregida_por = $18, corregida_en = NOW(), updated_at = NOW()
      WHERE id = $1`,
    [ventaId, clienteFinal || null, cobro.metodoPago, cobro.recibido, cobro.cambio,
      d.id, d.nombre, d.tipo, d.valor, totales.subtotal, totales.descuentoMonto, totales.ivaPorcentaje, totales.ivaMonto,
      totales.total,
      cobro.abonoInicial, cobro.metodoAbono, cobro.billetera, usuario.id]
  );
  // Solo se crea el abono inicial si la venta no tenía abonos (si los tenía, se conservan tal cual).
  if (abonado === 0) await registrarAbonoInicial(client, usuario, ventaId, clienteFinal, cobro);
}

module.exports = { crearAbierta, actualizarAbierta, descartarAbierta, cerrar, corregir };
