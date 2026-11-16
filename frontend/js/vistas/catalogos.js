// Proveedores y categorías (administrador) en una sola pantalla con pestañas.
// La configuración de "descuentos" vive aquí pero se muestra en su propio módulo (descuentos.js, RF-01).
import { $, esc, moneda } from '../util.js';
import { crearCrudVista } from './crudVista.js';

export const CONFIG = {
  proveedores: {
    titulo: 'Proveedores', eyebrow: 'COMPRAS', ruta: '/proveedores', singular: 'proveedor',
    campos: [
      { id: 'nombre', etiqueta: 'Nombre', requerido: true },
      { id: 'nit', etiqueta: 'NIT', requerido: true },
      { id: 'telefono', etiqueta: 'Teléfono de contacto', requerido: true }
    ],
    columnas: [
      { titulo: 'Nombre', valor: (p) => esc(p.nombre) },
      { titulo: 'NIT', valor: (p) => esc(p.nit) },
      { titulo: 'Contacto', valor: (p) => esc(p.telefono) }
    ]
  },
  categorias: {
    titulo: 'Categorías', eyebrow: 'PRODUCTOS', ruta: '/categorias', singular: 'categoría',
    campos: [
      { id: 'nombre', etiqueta: 'Nombre', requerido: true },
      { id: 'color', etiqueta: 'Color', tipo: 'color', defecto: '#6c757d' }
    ],
    columnas: [
      { titulo: 'Nombre', valor: (c) => esc(c.nombre) },
      { titulo: 'Color', valor: (c) => `<span class="badge" style="background:${esc(c.color)};color:#fff">${esc(c.color)}</span>` },
      { titulo: 'Productos', valor: (c) => c.totalProductos }
    ]
  },
  descuentos: {
    titulo: 'Descuentos', eyebrow: 'VENTAS', ruta: '/descuentos', singular: 'descuento',
    campos: [
      { id: 'nombre', etiqueta: 'Nombre', requerido: true },
      { id: 'tipo', etiqueta: 'Tipo', tipo: 'select', defecto: 'porcentaje',
        opciones: [{ valor: 'porcentaje', texto: 'Porcentaje (%)' }, { valor: 'fijo', texto: 'Valor fijo ($)' }] },
      { id: 'valor', etiqueta: 'Valor', tipo: 'number', requerido: true, min: 0.01, step: 'any' }
    ],
    columnas: [
      { titulo: 'Nombre', valor: (d) => esc(d.nombre) },
      { titulo: 'Tipo', valor: (d) => (d.tipo === 'porcentaje' ? 'Porcentaje' : 'Valor fijo') },
      { titulo: 'Valor', valor: (d) => (d.tipo === 'porcentaje' ? `${d.valor}%` : moneda(d.valor)) }
    ]
  }
};

export async function montar(cont) {
  const pestanas = Object.entries(CONFIG).filter(([id]) => id !== 'descuentos');
  cont.innerHTML = `
    <div class="pagina-admin" style="padding-bottom:0">
      <div class="pestanas">${pestanas.map(([id, c], i) => `<button type="button" class="chip ${i === 0 ? 'activo' : ''}" data-tab="${id}">${esc(c.titulo)}</button>`).join('')}</div>
    </div><div id="cat-contenido"></div>`;

  const mostrar = (id) => crearCrudVista({ cont: $('#cat-contenido', cont), ...CONFIG[id] }).cargar();
  cont.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (!t) return;
    cont.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('activo', b === t));
    mostrar(t.dataset.tab);
  });
  await mostrar('proveedores');
}
