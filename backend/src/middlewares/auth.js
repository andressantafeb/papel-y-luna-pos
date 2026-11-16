const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { unauthorized, forbidden } = require('../utils/httpError');

// Verifica el token Bearer y carga req.usuario desde la base de datos
// (así un usuario desactivado pierde el acceso de inmediato).
const autenticar = asyncHandler(async (req, res, next) => {
  const [esquema, token] = (req.headers.authorization || '').split(' ');
  if (esquema !== 'Bearer' || !token) throw unauthorized('Falta el token de autenticación.');

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch (error) {
    throw unauthorized('La sesión no es válida o expiró. Inicia sesión de nuevo.');
  }

  const { rows } = await query(
    'SELECT id, nombre, username, rol FROM usuarios WHERE id = $1 AND activo = TRUE',
    [Number(payload.sub)]
  );
  if (!rows.length) throw unauthorized('El usuario ya no está activo.');

  req.usuario = rows[0];
  next();
});

// Restringe una ruta a uno o más roles: requerirRol('administrador').
const requerirRol = (...roles) => (req, res, next) => {
  if (!req.usuario) return next(unauthorized());
  if (!roles.includes(req.usuario.rol)) {
    return next(forbidden('Esta acción solo está disponible para: ' + roles.join(', ') + '.'));
  }
  return next();
};

module.exports = { autenticar, requerirRol };
