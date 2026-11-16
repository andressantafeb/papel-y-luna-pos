const { Router } = require('express');
const { autenticar, requerirRol } = require('../middlewares/auth');
const catalogos = require('../controllers/catalogosController');

const AMBOS = ['administrador', 'cajero'];
const ADMIN = ['administrador'];

// Matriz de permisos P3.1: categorías y descuentos se consultan por ambos roles pero los gestiona
// el administrador; proveedores es solo administrador; clientes los gestionan ambos roles.
function crearRouter(crud, { lectura, escritura }) {
  const router = Router();
  router.use(autenticar);
  router.get('/', requerirRol(...lectura), crud.listar);
  router.get('/:id', requerirRol(...lectura), crud.obtener);
  router.post('/', requerirRol(...escritura), crud.crear);
  router.put('/:id', requerirRol(...escritura), crud.actualizar);
  router.delete('/:id', requerirRol(...escritura), crud.eliminar);
  return router;
}

module.exports = {
  categorias: crearRouter(catalogos.categorias, { lectura: AMBOS, escritura: ADMIN }),
  proveedores: crearRouter(catalogos.proveedores, { lectura: ADMIN, escritura: ADMIN }),
  clientes: crearRouter(catalogos.clientes, { lectura: AMBOS, escritura: AMBOS }),
  descuentos: crearRouter(catalogos.descuentos, { lectura: AMBOS, escritura: ADMIN })
};
