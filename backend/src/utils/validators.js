const { badRequest } = require('./httpError');

const redondear = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function entero(valor, campo, { min = 0, requerido = true } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (requerido) throw badRequest(`El campo "${campo}" es obligatorio.`);
    return null;
  }
  const n = Number(valor);
  if (!Number.isInteger(n) || n < min) {
    throw badRequest(`El campo "${campo}" debe ser un entero mayor o igual a ${min}.`);
  }
  return n;
}

// Id opcional: undefined => undefined (no enviado), null/"" => null, otro => entero >= 1.
function idOpcional(valor, campo) {
  if (valor === undefined) return undefined;
  if (valor === null || valor === '') return null;
  return entero(valor, campo, { min: 1 });
}

function numero(valor, campo, { min = 0, requerido = true } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (requerido) throw badRequest(`El campo "${campo}" es obligatorio.`);
    return null;
  }
  const n = Number(valor);
  if (!Number.isFinite(n) || n < min) {
    throw badRequest(`El campo "${campo}" debe ser un número mayor o igual a ${min}.`);
  }
  return redondear(n);
}

function texto(valor, campo, { requerido = true, max = 150 } = {}) {
  const t = typeof valor === 'string' ? valor.trim() : '';
  if (!t) {
    if (requerido) throw badRequest(`El campo "${campo}" es obligatorio.`);
    return null;
  }
  if (t.length > max) throw badRequest(`El campo "${campo}" no puede superar ${max} caracteres.`);
  return t;
}

function opcion(valor, campo, opciones) {
  if (!opciones.includes(valor)) {
    throw badRequest(`El campo "${campo}" debe ser uno de: ${opciones.join(', ')}.`);
  }
  return valor;
}

function idParam(valor, nombre = 'id') {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1) throw badRequest(`El parámetro "${nombre}" no es válido.`);
  return n;
}

// Valida un arreglo de ítems [{ productoId, cantidad }] sin productos repetidos.
function itemsCantidad(items, { permitirVacio = false } = {}) {
  if (!Array.isArray(items)) throw badRequest('El campo "items" debe ser un arreglo.');
  if (!items.length && !permitirVacio) throw badRequest('Debes enviar al menos un producto.');
  const vistos = new Set();
  return items.map((item, i) => {
    const productoId = entero(item?.productoId, `items[${i}].productoId`, { min: 1 });
    const cantidad = entero(item?.cantidad, `items[${i}].cantidad`, { min: 1 });
    if (vistos.has(productoId)) throw badRequest(`El producto ${productoId} está repetido; suma las cantidades en una sola línea.`);
    vistos.add(productoId);
    return { productoId, cantidad };
  });
}

// Fecha YYYY-MM-DD o null.
function fecha(valor, campo) {
  if (valor === undefined || valor === null || valor === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor)) || Number.isNaN(Date.parse(valor))) {
    throw badRequest(`El campo "${campo}" debe tener formato AAAA-MM-DD.`);
  }
  return String(valor);
}

module.exports = { redondear, entero, idOpcional, numero, texto, opcion, idParam, itemsCantidad, fecha };
