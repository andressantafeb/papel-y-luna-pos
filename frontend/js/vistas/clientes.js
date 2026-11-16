// Clientes: CRUD para administrador y cajero.
import { esc } from '../util.js';
import { crearCrudVista } from './crudVista.js';

export async function montar(cont) {
  const vista = crearCrudVista({
    cont, titulo: 'Clientes', eyebrow: 'GESTIÓN', ruta: '/clientes', singular: 'cliente',
    campos: [
      { id: 'nombre', etiqueta: 'Nombre', requerido: true },
      { id: 'telefono', etiqueta: 'Teléfono' }
    ],
    columnas: [
      { titulo: 'Nombre', valor: (c) => esc(c.nombre) },
      { titulo: 'Teléfono', valor: (c) => esc(c.telefono || '—') }
    ]
  });
  await vista.cargar();
}
