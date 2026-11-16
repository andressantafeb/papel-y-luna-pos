// Descuentos (administrador): crear, editar y eliminar el catálogo (RF-112, 3.6). El cajero solo los aplica en la venta.
import { crearCrudVista } from './crudVista.js';
import { CONFIG } from './catalogos.js';

export async function montar(cont) {
  await crearCrudVista({ cont, ...CONFIG.descuentos }).cargar();
}
