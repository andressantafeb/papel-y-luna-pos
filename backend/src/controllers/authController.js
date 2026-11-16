const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { texto } = require('../utils/validators');
const { unauthorized } = require('../utils/httpError');

// Hash válido usado para igualar el tiempo de respuesta cuando el usuario no existe.
const HASH_FALSO = bcrypt.hashSync('no-existe', 8);

const datosUsuario = (u) => ({ id: u.id, nombre: u.nombre, username: u.username, rol: u.rol });

// POST /api/auth/login  { username, password }  ->  { token, usuario }
const login = asyncHandler(async (req, res) => {
  const username = texto(req.body?.username, 'username', { max: 50 }).toLowerCase();
  const password = texto(req.body?.password, 'password', { max: 100 });

  const { rows } = await query(
    'SELECT id, nombre, username, rol, password_hash FROM usuarios WHERE username = $1 AND activo = TRUE',
    [username]
  );
  const usuario = rows[0];
  const valido = await bcrypt.compare(password, usuario ? usuario.password_hash : HASH_FALSO);
  if (!usuario || !valido) throw unauthorized('Usuario o contraseña incorrectos.');

  const token = jwt.sign({ sub: String(usuario.id), rol: usuario.rol }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
  res.json({ token, usuario: datosUsuario(usuario) });
});

// GET /api/auth/me -> usuario de la sesión (el frontend lo usa para restaurar la sesión)
const me = (req, res) => {
  res.json({ usuario: datosUsuario(req.usuario) });
};

// POST /api/auth/logout
// El token es sin estado: el cierre de sesión real ocurre en el cliente al descartar el token.
// Se expone el endpoint para mantener un flujo uniforme y poder auditar el cierre.
const logout = (req, res) => {
  res.json({ mensaje: 'Sesión cerrada correctamente.' });
};

module.exports = { login, me, logout };
