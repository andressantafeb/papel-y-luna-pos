const router = require('express').Router();
const { login, me, logout } = require('../controllers/authController');
const { autenticar } = require('../middlewares/auth');

router.post('/login', login);
router.get('/me', autenticar, me);
router.post('/logout', autenticar, logout);

module.exports = router;
