const router = require('express').Router();
const c = require('../controllers/cuentaController');
const { autenticar } = require('../middlewares/auth');

// Cuentas por cobrar y abonos: administrador y cajero (el cajero atiende a los clientes en caja).
router.use(autenticar);

router.get('/', c.listar);
router.get('/clientes/:clienteId', c.detalleCliente);
router.post('/clientes/:clienteId/abonos', c.registrarAbono);

module.exports = router;
