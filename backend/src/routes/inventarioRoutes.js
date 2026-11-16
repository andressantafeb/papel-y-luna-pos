const router = require('express').Router();
const c = require('../controllers/inventarioController');
const { autenticar, requerirRol } = require('../middlewares/auth');

router.use(autenticar);

// Consulta de movimientos: administrador y cajero
router.get('/movimientos', c.listarMovimientos);
router.get('/productos/:id/movimientos', c.kardex);

// Ajuste manual de stock: solo administrador
router.post('/ajustes', requerirRol('administrador'), c.ajustar);

module.exports = router;
