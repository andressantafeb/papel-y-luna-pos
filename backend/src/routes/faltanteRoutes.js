const router = require('express').Router();
const c = require('../controllers/faltanteController');
const { autenticar } = require('../middlewares/auth');

// Registrar y consultar faltantes: administrador y cajero
router.use(autenticar);

router.get('/resumen', c.resumen);
router.get('/', c.listar);
router.post('/', c.crear);
router.put('/:id/resolver', c.resolver);

module.exports = router;
