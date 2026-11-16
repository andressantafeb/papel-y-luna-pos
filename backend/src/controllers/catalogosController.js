const { crearCrud, pick } = require('./crudFactory');
const { texto, numero, opcion } = require('../utils/validators');
const { badRequest } = require('../utils/httpError');

const contar = (desde, mensaje) => ({ sql: `SELECT COUNT(*)::int AS total ${desde}`, mensaje });

const categorias = crearCrud({
  tabla: 'categorias',
  select: `SELECT t.id, t.nombre, t.color, t.icono,
                  (SELECT COUNT(*)::int FROM productos p WHERE p.categoria_id = t.id) AS "totalProductos"
             FROM categorias t`,
  orderBy: 't.nombre',
  mensajes: { noExiste: 'La categoría no existe.', eliminado: 'Categoría eliminada.' },
  leer: (body, actual) => ({
    nombre: texto(pick(body, 'nombre', actual), 'nombre', { max: 80 }),
    color: texto(pick(body, 'color', actual), 'color', { requerido: false, max: 20 }) || '#6c757d',
    icono: texto(pick(body, 'icono', actual), 'icono', { requerido: false, max: 50 })
  }),
  referencias: [
    contar('FROM productos WHERE categoria_id = $1', 'No se puede eliminar la categoría porque tiene productos asociados.')
  ]
});

const proveedores = crearCrud({
  tabla: 'proveedores',
  select: 'SELECT t.id, t.nombre, t.nit, t.telefono FROM proveedores t',
  orderBy: 't.nombre',
  mensajes: { noExiste: 'El proveedor no existe.', eliminado: 'Proveedor eliminado.' },
  leer: (body, actual) => ({
    nombre: texto(pick(body, 'nombre', actual), 'nombre', { max: 120 }),
    nit: texto(pick(body, 'nit', actual), 'nit', { max: 30 }),
    telefono: texto(pick(body, 'telefono', actual), 'telefono', { max: 30 })
  }),
  referencias: [
    contar('FROM compras WHERE proveedor_id = $1', 'No se puede eliminar el proveedor porque tiene compras registradas.'),
    contar('FROM producto_proveedor WHERE proveedor_id = $1', 'No se puede eliminar el proveedor porque está asociado a productos.'),
    contar('FROM faltantes WHERE proveedor_id = $1', 'No se puede eliminar el proveedor porque está asociado a faltantes.')
  ]
});

const clientes = crearCrud({
  tabla: 'clientes',
  select: 'SELECT t.id, t.nombre, t.telefono FROM clientes t',
  orderBy: 't.nombre',
  mensajes: { noExiste: 'El cliente no existe.', eliminado: 'Cliente eliminado.' },
  leer: (body, actual) => ({
    nombre: texto(pick(body, 'nombre', actual), 'nombre', { max: 120 }),
    telefono: texto(pick(body, 'telefono', actual), 'telefono', { requerido: false, max: 30 })
  }),
  referencias: [
    contar('FROM ventas WHERE cliente_id = $1', 'No se puede eliminar el cliente porque tiene ventas asociadas.')
  ]
});

// Eliminar un descuento no altera las ventas ya registradas: la venta guarda una copia (snapshot).
const descuentos = crearCrud({
  tabla: 'descuentos',
  select: 'SELECT t.id, t.nombre, t.tipo, t.valor FROM descuentos t',
  orderBy: 't.nombre',
  mensajes: { noExiste: 'El descuento no existe.', eliminado: 'Descuento eliminado.' },
  leer: (body, actual) => {
    const tipo = opcion(pick(body, 'tipo', actual), 'tipo', ['porcentaje', 'fijo']);
    const valor = numero(pick(body, 'valor', actual), 'valor', { min: 0.01 });
    if (tipo === 'porcentaje' && valor > 100) throw badRequest('Un descuento porcentual no puede superar el 100%.');
    return { nombre: texto(pick(body, 'nombre', actual), 'nombre', { max: 100 }), tipo, valor };
  }
});

module.exports = { categorias, proveedores, clientes, descuentos };
