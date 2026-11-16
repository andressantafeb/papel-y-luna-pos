// Configuración del frontend.
//
// - Frontend servido por el propio backend (http://localhost:3000 o el dominio del API): rutas relativas ('/api').
// - Frontend abierto con otro servidor local (Live Server, Vite...) o como archivo: apunta a localhost:3000.
// - Frontend desplegado por separado (GitHub Pages, Netlify, Vercel...): escribe aquí la URL pública
//   del backend, por ejemplo 'https://mi-api.onrender.com/api'.
const URL_API_DESPLEGADO = '';

const PUERTOS_DE_DESARROLLO = ['5500', '5501', '5173', '8000', '8080'];
const mismoOrigen = window.location.protocol.startsWith('http') && !PUERTOS_DE_DESARROLLO.includes(window.location.port);

window.APP_CONFIG = {
  API_URL: URL_API_DESPLEGADO || (mismoOrigen ? '/api' : 'http://localhost:3000/api')
};
