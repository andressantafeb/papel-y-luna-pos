const router = require('express').Router();
const c = require('../controllers/ventaController');
const r = require('../controllers/reembolsoController');
const { autenticar, requerirRol } = require('../middlewares/auth');

const soloAdmin = requerirRol('administrador');

router.use(autenticar);

// Administrador y cajero: crear, guardar, retomar, cerrar, historial y factura
router.get('/', c.listar);
router.post('/', c.crear);
router.get('/:id', c.obtener);
router.put('/:id', c.actualizar);
router.delete('/:id', c.descartar);
router.post('/:id/cerrar', c.cerrar);

// Solo administrador: corrección de ventas cerradas y reembolsos
router.put('/:id/correccion', soloAdmin, c.corregir);
router.get('/:id/reembolsos', soloAdmin, r.listar);
router.post('/:id/reembolsos/previsualizar', soloAdmin, r.previsualizar);
router.post('/:id/reembolsos', soloAdmin, r.registrar);

module.exports = router;
