// HTML del modal de cobro (sin lógica). Los ids "cb-*" los usa cobro.js.
import { moneda } from '../util.js';
import {
  METODOS_PAGO, METODOS_ABONO, campoBilletera, botonesMetodo
} from '../pagos.js';

/** `p` = datos previos (al corregir una venta): método, billetera y abono de la venta original. */
export function htmlCobro({ total, metodo, metodoAbono, p }) {
  return `
    <span class="eyebrow">COBRO</span><h2>Cobrar venta</h2>
    <div class="resumen-cobro"><span>Total a pagar</span><strong>${moneda(total)}</strong></div>
    <label>Método de pago</label>
    <div class="metodos cuatro">${botonesMetodo(METODOS_PAGO, metodo, 'data-metodo')}</div>
    <div id="cb-efectivo">
      <label for="cb-recibido">Valor recibido</label>
      <input id="cb-recibido" type="number" min="0" step="1" inputmode="numeric" placeholder="$0">
      <div class="cambio"><span>Cambio</span><strong id="cb-cambio">$0</strong></div>
    </div>
    <div id="cb-transferencia" class="oculto">${campoBilletera('cb-billetera', p.metodoPago === 'Transferencia' ? p.billetera : '')}</div>
    <div id="cb-debe" class="bloque-abono oculto">
      <label for="cb-abono">Abono inicial <small>(opcional)</small></label>
      <input id="cb-abono" type="number" min="0" step="1" inputmode="numeric" placeholder="$0" value="${p.abonoInicial || 0}">
      <label>Método del abono</label>
      <div class="metodos tres">${botonesMetodo(METODOS_ABONO, metodoAbono, 'data-abono')}</div>
      <div id="cb-abono-transf" class="oculto">${campoBilletera('cb-billetera-abono', p.metodoPago === 'Debe' ? p.billetera : '')}</div>
      <div class="cambio saldo"><span>Saldo pendiente</span><strong id="cb-saldo">${moneda(total)}</strong></div>
    </div>
    <label for="cb-cliente">Cliente <small>(obligatorio con Debe)</small></label>
    <select id="cb-cliente"></select>
    <div class="form-inline" style="margin-top:8px">
      <div><input id="cb-nuevo" type="text" placeholder="Nombre de un cliente nuevo"></div>
      <button type="button" class="boton secundario" id="cb-crear">Crear</button>
    </div>
    <p id="cb-error" class="aviso-error oculto" role="alert"></p>
    <button type="button" id="cb-confirmar" class="boton primario ancho">Confirmar cobro</button>
    `;
}
