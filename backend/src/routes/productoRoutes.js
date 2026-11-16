const router = require('express').Router();
const c = require('../controllers/productoController');
const { autenticar, requerirRol } = require('../middlewares/auth');

router.use(autenticar);

// Administrador y cajero: consultar y editar "en caliente" desde el flujo de venta
router.get('/', c.listar);
router.get('/:id', c.obtener);
router.put('/:id', c.actualizar);

// Solo administrador: crear y eliminar
router.post('/', requerirRol('administrador'), c.crear);
router.delete('/:id', requerirRol('administrador'), c.eliminar);

module.exports = router;
