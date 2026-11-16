const { badRequest } = require('../utils/httpError');
const { redondear } = require('../utils/validators');

async function cargarProductos(client, ids) {
  if (!ids.length) return new Map();
  const { rows } = await client.query(
    'SELECT id, nombre, precio FROM productos WHERE id = ANY($1::int[])',
    [ids]
  );
  return new Map(rows.map((p) => [p.id, p]));
}

/**
 * Convierte [{productoId, cantidad}] en líneas de venta con precio y subtotal.
 * `preciosPrevios` (Map productoId -> precio) conserva el precio original de las
 * líneas que ya existían (corrección de ventas cerradas); el resto usa el precio actual.
 */
async function construirLineas(client, items, preciosPrevios = new Map()) {
  const productos = await cargarProductos(client, items.map((i) => i.productoId));
  return items.map(({ productoId, cantidad }) => {
    const producto = productos.get(productoId);
    if (!producto) throw badRequest(`El producto ${productoId} no existe.`);
    const precio = preciosPrevios.has(productoId) ? preciosPrevios.get(productoId) : producto.precio;
    return {
      productoId,
      nombre: producto.nombre,
      precio,
      cantidad,
      subtotal: redondear(precio * cantidad)
    };
  });
}

async function cargarDescuento(client, descuentoId) {
  const { rows } = await client.query('SELECT id, nombre, tipo, valor FROM descuentos WHERE id = $1', [descuentoId]);
  if (!rows.length) throw badRequest(`El descuento ${descuentoId} no existe.`);
  return rows[0];
}

/** Subtotal, monto de descuento y total. Rechaza totales negativos (RF-19). */
function calcularTotales(lineas, descuento) {
  const subtotal = redondear(lineas.reduce((suma, l) => suma + l.subtotal, 0));
  let descuentoMonto = 0;
  if (descuento) {
    descuentoMonto = descuento.tipo === 'porcentaje'
      ? redondear((subtotal * descuento.valor) / 100)
      : redondear(descuento.valor);
    if (descuentoMonto > subtotal) {
      throw badRequest(`El descuento "${descuento.nombre}" supera el valor de la venta y dejaría el total en negativo.`);
    }
  }
  return { subtotal, descuentoMonto, total: redondear(subtotal - descuentoMonto) };
}

async function verificarCliente(client, clienteId) {
  if (clienteId === null || clienteId === undefined) return;
  const { rows } = await client.query('SELECT 1 FROM clientes WHERE id = $1', [clienteId]);
  if (!rows.length) throw badRequest(`El cliente ${clienteId} no existe.`);
}

const { METODOS_PAGO, METODOS_ABONO, BILLETERA_MAX } = require('../utils/metodosPago');

/** Billetera o banco de una transferencia: texto libre y opcional. Vacío = null. */
function leerBilletera(valor) {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'string') throw badRequest('La billetera o banco debe ser un texto.');
  const texto = valor.trim();
  if (texto.length > BILLETERA_MAX) throw badRequest(`La billetera o banco no puede superar ${BILLETERA_MAX} caracteres.`);
  return texto || null;
}

/** Abono inicial solicitado: vacío = 0. Debe ser un número >= 0. */
function leerAbono(abonoInicial) {
  if (abonoInicial === undefined || abonoInicial === null || abonoInicial === '') return 0;
  const valor = Number(abonoInicial);
  if (!Number.isFinite(valor) || valor < 0) throw badRequest('El abono inicial debe ser un número mayor o igual a 0.');
  return redondear(valor);
}

/**
 * Valida el pago y calcula el cambio (RF-21 a RF-23).
 * En ventas a Debe también valida el abono inicial: 0 <= abono < total y método Efectivo, Transferencia o Tarjeta.
 * Transferencia admite una billetera o banco opcional; con Debe, aplica al abono inicial si se paga por Transferencia.
 * Devuelve { metodoPago, recibido, cambio, abonoInicial, metodoAbono, billetera }.
 */
function resolverPago({ metodoPago, recibido, clienteId, abonoInicial, metodoAbono, billetera }, total) {
  if (!METODOS_PAGO.includes(metodoPago)) {
    throw badRequest('Selecciona un método de pago válido: Efectivo, Transferencia, Tarjeta o Debe.');
  }
  const abono = leerAbono(abonoInicial);
  if (metodoPago !== 'Debe' && abono > 0) {
    throw badRequest('El abono inicial solo aplica a ventas a Debe.');
  }
  if (metodoPago === 'Efectivo') {
    const valor = Number(recibido);
    if (recibido === undefined || recibido === null || recibido === '' || !Number.isFinite(valor) || valor < 0) {
      throw badRequest('Indica el valor recibido en efectivo.');
    }
    if (valor < total) throw badRequest('El efectivo recibido debe ser igual o mayor al total.');
    return { metodoPago, recibido: redondear(valor), cambio: redondear(valor - total), abonoInicial: 0, metodoAbono: null, billetera: null };
  }
  if (metodoPago === 'Debe') {
    if (!clienteId) throw badRequest('Para una venta a Debe debes asociar un cliente.');
    if (abono > 0) {
      if (abono >= total) {
        throw badRequest('El abono inicial debe ser menor al total; si cubre toda la venta, cóbrala en Efectivo, Transferencia o Tarjeta.');
      }
      if (!METODOS_ABONO.includes(metodoAbono)) {
        throw badRequest('Indica con qué método se paga el abono inicial: Efectivo, Transferencia o Tarjeta.');
      }
    }
    const conAbono = abono > 0;
    return {
      metodoPago, recibido: null, cambio: 0, abonoInicial: abono,
      metodoAbono: conAbono ? metodoAbono : null,
      billetera: conAbono && metodoAbono === 'Transferencia' ? leerBilletera(billetera) : null
    };
  }
  // Transferencia o Tarjeta: el pago es exacto (sin recibido ni cambio). Solo la transferencia lleva billetera.
  return {
    metodoPago, recibido: null, cambio: 0, abonoInicial: 0, metodoAbono: null,
    billetera: metodoPago === 'Transferencia' ? leerBilletera(billetera) : null
  };
}

async function reemplazarLineas(client, ventaId, lineas) {
  await client.query('DELETE FROM venta_items WHERE venta_id = $1', [ventaId]);
  for (const l of lineas) {
    await client.query(
      `INSERT INTO venta_items (venta_id, producto_id, nombre_producto, precio_unitario, cantidad, subtotal)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [ventaId, l.productoId, l.nombre, l.precio, l.cantidad, l.subtotal]
    );
  }
}

// Copia del descuento que se guarda en la venta (no cambia si el catálogo cambia).
const snapshotDescuento = (d) => ({
  id: d ? d.id : null,
  nombre: d ? d.nombre : null,
  tipo: d ? d.tipo : null,
  valor: d ? d.valor : null
});

module.exports = {
  construirLineas,
  cargarDescuento,
  calcularTotales,
  verificarCliente,
  resolverPago,
  reemplazarLineas,
  snapshotDescuento
};
