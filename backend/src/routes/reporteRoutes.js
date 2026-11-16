const router = require('express').Router();
const c = require('../controllers/reporteController');
const { autenticar, requerirRol } = require('../middlewares/auth');

// Reportes: solo administrador
router.use(autenticar, requerirRol('administrador'));

router.get('/ventas', c.ventas);
router.get('/productos-mas-vendidos', c.productosMasVendidos);
router.get('/compras', c.compras);
router.get('/faltantes', c.faltantes);

module.exports = router;
