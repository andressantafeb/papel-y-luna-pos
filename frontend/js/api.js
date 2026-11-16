// Capa de acceso al backend: fetch con token, errores uniformes, sesión en localStorage
// y overlay global de carga en las peticiones que modifican datos.
import { mostrarCarga, ocultarCarga, MENSAJE_POR_DEFECTO } from './carga.js';

const BASE = (window.APP_CONFIG && window.APP_CONFIG.API_URL) || '/api';
const CLAVE_TOKEN = 'papelYLuna_token';

// Una pantalla bloqueada no puede esperar para siempre si el servidor no responde.
const TIEMPO_MAXIMO_MS = 60000;

// Textos más específicos para las operaciones pesadas. Se prueban en orden contra "MÉTODO /ruta".
const MENSAJES_CARGA = [
  [/\/cerrar$/, 'Cobrando la venta...'],
  [/\/abonos$/, 'Registrando el abono...'],
  [/\/correccion$/, 'Guardando la corrección...'],
  [/\/reembolsos$/, 'Registrando el reembolso...'],
  [/^POST \/compras$/, 'Guardando la compra...'],
  [/^POST \/clientes$/, 'Creando el cliente...'],
  [/^POST \/auth\/login$/, 'Iniciando sesión...']
];

export const sesion = {
  token: () => localStorage.getItem(CLAVE_TOKEN),
  guardar: (token) => localStorage.setItem(CLAVE_TOKEN, token),
  limpiar: () => localStorage.removeItem(CLAVE_TOKEN)
};

export class ApiError extends Error {
  constructor(status, mensaje, detalles) {
    super(mensaje);
    this.status = status;
    this.detalles = detalles;
  }
}

/**
 * Texto del overlay para una petición, o null si no debe mostrarlo.
 * `carga`: false = sin overlay, true = fuerza el overlay (útil en un GET pesado), texto = mensaje propio.
 * Por defecto lo muestran POST, PUT y DELETE (modifican datos); los GET no.
 */
function mensajeDeCarga(metodo, ruta, carga) {
  if (carga === false) return null;
  if (typeof carga === 'string') return carga;
  if (metodo === 'GET' && carga !== true) return null;
  const hallado = MENSAJES_CARGA.find(([patron]) => patron.test(`${metodo} ${ruta}`));
  return hallado ? hallado[1] : MENSAJE_POR_DEFECTO;
}

async function enviar(metodo, ruta, cuerpo, tiempoMaximo) {
  const token = sesion.token();
  const control = tiempoMaximo ? new AbortController() : null;
  const reloj = control ? setTimeout(() => control.abort(), tiempoMaximo) : null;
  try {
    let respuesta;
    try {
      respuesta = await fetch(BASE + ruta, {
        method: metodo,
        headers: {
          ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
        signal: control ? control.signal : undefined
      });
    } catch (error) {
      if (control && control.signal.aborted) {
        // El servidor pudo haber guardado la operación: se avisa para no repetirla a ciegas (p. ej. un cobro).
        throw new ApiError(0, 'La solicitud tardó demasiado en responder. Antes de intentarlo de nuevo, revisa en el historial si ya se registró.');
      }
      throw new ApiError(0, 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.');
    }

    let datos = null;
    try { datos = await respuesta.json(); } catch (error) { /* respuesta sin cuerpo */ }

    if (!respuesta.ok) {
      // Sesión vencida: avisa a la aplicación para volver al login.
      if (respuesta.status === 401 && token) window.dispatchEvent(new CustomEvent('sesion-expirada'));
      throw new ApiError(respuesta.status, (datos && datos.error) || 'Ocurrió un error inesperado.', datos && datos.detalles);
    }
    return datos;
  } finally {
    if (reloj) clearTimeout(reloj);
  }
}

export async function api(metodo, ruta, cuerpo, { carga } = {}) {
  const mensaje = mensajeDeCarga(metodo, ruta, carga);
  if (!mensaje) return enviar(metodo, ruta, cuerpo, null);
  mostrarCarga(mensaje);
  try {
    return await enviar(metodo, ruta, cuerpo, TIEMPO_MAXIMO_MS);
  } finally {
    ocultarCarga(); // también si la petición falla: la pantalla nunca queda bloqueada
  }
}

// El último argumento es opcional: { carga: false | true | 'texto' } (ver mensajeDeCarga).
export const get = (ruta, opciones) => api('GET', ruta, undefined, opciones);
export const post = (ruta, cuerpo = {}, opciones) => api('POST', ruta, cuerpo, opciones);
export const put = (ruta, cuerpo = {}, opciones) => api('PUT', ruta, cuerpo, opciones);
export const del = (ruta, opciones) => api('DELETE', ruta, undefined, opciones);

// Arma una query string omitiendo los valores vacíos: qs({ desde: '2026-01-01', tipo: '' }) -> "?desde=2026-01-01"
export function qs(parametros) {
  const p = new URLSearchParams();
  Object.entries(parametros || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.append(k, v); });
  const texto = p.toString();
  return texto ? `?${texto}` : '';
}
