// Punto de entrada: sesión, menú por rol y navegación entre vistas.
import { get, post, sesion } from './api.js';
import { $, esc, toast, mostrarError } from './util.js';
import { montarLogin } from './vistas/login.js';
import { ICONOS, ICONO_HAMBURGUESA } from './iconos.js';

// Cada vista se carga bajo demanda (import dinámico) y exporta montar(contenedor, usuario).
const VISTAS = {
  venta: { titulo: 'Nueva venta', roles: ['administrador', 'cajero'], modulo: () => import('./vistas/venta.js') },
  historial: { titulo: 'Ventas', roles: ['administrador', 'cajero'], modulo: () => import('./vistas/historial.js') },
  productos: { titulo: 'Productos', roles: ['administrador', 'cajero'], modulo: () => import('./vistas/productos.js') },
  clientes: { titulo: 'Clientes', roles: ['administrador', 'cajero'], modulo: () => import('./vistas/clientes.js') },
  cuentas: { titulo: 'Cuentas por cobrar', roles: ['administrador', 'cajero'], modulo: () => import('./vistas/cuentas.js') },
  faltantes: { titulo: 'Faltantes', roles: ['administrador', 'cajero'], modulo: () => import('./vistas/faltantes.js') },
  compras: { titulo: 'Compras', roles: ['administrador'], modulo: () => import('./vistas/compras.js') },
  descuentos: { titulo: 'Descuentos', roles: ['administrador'], modulo: () => import('./vistas/descuentos.js') },
  catalogos: { titulo: 'Proveedores y categorías', roles: ['administrador'], modulo: () => import('./vistas/catalogos.js') },
  inventario: { titulo: 'Inventario', roles: ['administrador'], modulo: () => import('./vistas/inventario.js') },
  reportes: { titulo: 'Reportes', roles: ['administrador'], modulo: () => import('./vistas/reportes.js') }
};

let usuario = null;
let vistaActual = null;
let tokenNavegacion = 0;

const vistasDe = (rol) => Object.keys(VISTAS).filter((id) => VISTAS[id].roles.includes(rol));

// Menú hamburguesa (móvil): abre/cierra el panel lateral #nav. En escritorio el botón está oculto por CSS.
function alternarMenu(abrir) {
  $('#nav').classList.toggle('abierto', abrir);
  $('#nav-backdrop').classList.toggle('abierto', abrir);
  document.querySelector('.app-header').classList.toggle('menu-abierto', abrir);
  const boton = $('#btn-menu');
  boton.setAttribute('aria-expanded', String(abrir));
  boton.setAttribute('aria-label', abrir ? 'Cerrar menú' : 'Abrir menú');
}
const cerrarMenu = () => alternarMenu(false);

function mostrarLogin() {
  usuario = null;
  $('#app').classList.add('oculto');
  const cont = $('#pantalla-login');
  cont.classList.remove('oculto');
  montarLogin(cont, (token, datos) => {
    sesion.guardar(token);
    iniciarApp(datos);
  });
}

function iniciarApp(datos) {
  usuario = datos;
  $('#pantalla-login').classList.add('oculto');
  $('#app').classList.remove('oculto');
  $('#usuario-info').textContent = `${datos.nombre} · ${datos.rol}`;

  const ids = vistasDe(datos.rol);
  // Cada módulo lleva su icono (visible en el panel lateral móvil). La cabecera del panel solo se ve en móvil.
  $('#nav').innerHTML = `
    <div class="nav-cabecera">
      <img src="img/logo.png" alt="">
      <div><strong>Papel y Luna</strong><small>Papelería &amp; Arte</small></div>
      <button type="button" class="nav-cerrar" id="nav-cerrar" aria-label="Cerrar menú">×</button>
    </div>`
    + ids.map((id) => `<button type="button" class="nav-boton" data-vista="${id}"><span class="nav-icono" aria-hidden="true">${ICONOS[id] || ''}</span><span class="nav-texto">${esc(VISTAS[id].titulo)}</span></button>`).join('');
  cerrarMenu();
  // Pie del panel (solo móvil): tarjeta con las iniciales, el nombre y el rol del usuario.
  const iniciales = String(datos.nombre || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  $('#nav').insertAdjacentHTML('beforeend', `
    <div class="nav-pie">
      <span class="nav-avatar" aria-hidden="true">${esc(iniciales)}</span>
      <div><strong>${esc(datos.nombre)}</strong><small><i class="nav-punto"></i>${esc(datos.rol)} · Activo</small></div>
    </div>`);
  const inicial = (location.hash || '').replace('#', '');
  navegar(ids.includes(inicial) ? inicial : ids[0]);
}

async function navegar(id) {
  if (!usuario || !VISTAS[id] || !VISTAS[id].roles.includes(usuario.rol)) return;
  const mio = ++tokenNavegacion;
  vistaActual = id;
  history.replaceState(null, '', `#${id}`);
  document.querySelectorAll('#nav [data-vista]').forEach((b) => b.classList.toggle('activo', b.dataset.vista === id));

  // Contenedor nuevo en cada navegación: descarta las escuchas de eventos de la vista anterior.
  const anterior = $('#contenido');
  const contenedor = anterior.cloneNode(false);
  anterior.replaceWith(contenedor);
  contenedor.innerHTML = '<div class="cargando">Cargando…</div>';
  try {
    const modulo = await VISTAS[id].modulo();
    if (mio !== tokenNavegacion) return; // el usuario ya navegó a otra vista
    contenedor.innerHTML = '';
    await modulo.montar(contenedor, usuario);
  } catch (error) {
    if (mio !== tokenNavegacion) return;
    contenedor.innerHTML = `<div class="pagina-admin"><div class="estado-vacio"><strong>No se pudo cargar la vista.</strong><span>${esc(error.message)}</span>
      <button type="button" class="boton primario" id="reintentar">Reintentar</button></div></div>`;
    $('#reintentar').addEventListener('click', () => navegar(id));
  }
}

async function cerrarSesion(aviso) {
  try { if (sesion.token() && !aviso) await post('/auth/logout', undefined, { carga: false }); } catch (error) { /* se cierra igual */ }
  sesion.limpiar();
  history.replaceState(null, '', location.pathname);
  mostrarLogin();
  if (aviso) toast(aviso, 'error');
}

async function arrancar() {
  $('#btn-menu').innerHTML = ICONO_HAMBURGUESA;
  $('#btn-menu').addEventListener('click', () => alternarMenu(!$('#nav').classList.contains('abierto')));
  $('#nav-backdrop').addEventListener('click', cerrarMenu);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarMenu(); });
  window.matchMedia('(min-width: 760px)').addEventListener('change', (e) => { if (e.matches) cerrarMenu(); });
  $('#nav').addEventListener('click', (e) => {
    if (e.target.closest('#nav-cerrar')) return cerrarMenu();
    const boton = e.target.closest('[data-vista]');
    if (boton) { cerrarMenu(); navegar(boton.dataset.vista); }
  });
  $('#btn-salir').addEventListener('click', () => cerrarSesion());
  window.addEventListener('sesion-expirada', () => { if (usuario) cerrarSesion('Tu sesión expiró. Inicia sesión de nuevo.'); });

  // Persistencia de sesión: si hay token válido se restaura sin pedir login.
  if (sesion.token()) {
    try {
      const { usuario: datos } = await get('/auth/me');
      iniciarApp(datos);
      return;
    } catch (error) {
      sesion.limpiar();
      if (error.status === 0) mostrarError(error);
    }
  }
  mostrarLogin();
}

arrancar();
