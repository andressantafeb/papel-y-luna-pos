const router = require('express').Router();
const c = require('../controllers/compraController');
const { autenticar, requerirRol } = require('../middlewares/auth');

// Compras y proveedores: solo administrador (matriz de permisos P3.1)
router.use(autenticar, requerirRol('administrador'));

router.get('/', c.listar);
router.get('/:id', c.obtener);
router.post('/', c.crear);

module.exports = router;
