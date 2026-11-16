// Ventas guardadas (abiertas): retomar o descartar (RF-15, RF-16, RF-172).
import { get, del } from '../api.js';
import { $, esc, moneda, fecha, abrirModal, toast, mostrarError, vacio, confirmar } from '../util.js';

export async function abrirAbiertas({ onRetomar }) {
  let lista;
  try { lista = await get('/ventas?estado=abierta'); } catch (err) { return mostrarError(err); }
  const modal = abrirModal('<span class="eyebrow">VENTAS GUARDADAS</span><h2>Retomar una venta</h2><div id="ab-lista"></div>');

  const pintar = () => {
    $('#ab-lista', modal.el).innerHTML = lista.length ? lista.map((v) => `
      <div class="venta-historial" style="margin-bottom:8px">
        <span><strong>Venta #${v.id}</strong><small>${esc(fecha(v.creadaEn))} · ${esc(v.usuarioNombre)} · ${moneda(v.total)}</small></span>
        <span class="acciones"><button type="button" class="boton primario" data-retomar="${v.id}">Retomar</button>
        <button type="button" class="boton peligro" data-descartar="${v.id}">Descartar</button></span>
      </div>`).join('') : vacio('No hay ventas guardadas.', 'Guarda una venta para retomarla después.');
  };
  pintar();

  modal.el.addEventListener('click', async (e) => {
    const r = e.target.closest('[data-retomar]');
    const d = e.target.closest('[data-descartar]');
    try {
      if (r) {
        const venta = await get(`/ventas/${r.dataset.retomar}`);
        modal.cerrar();
        onRetomar(venta);
      }
      if (d) {
        const id = d.dataset.descartar;
        if (!await confirmar('Descartar venta', `¿Descartar la venta #${id}? No se puede deshacer.`, { textoOk: 'Descartar', peligro: true })) return;
        await del(`/ventas/${id}`);
        lista = lista.filter((v) => String(v.id) !== id);
        pintar();
        toast('Venta descartada.');
      }
    } catch (err) { mostrarError(err); }
  });
}
