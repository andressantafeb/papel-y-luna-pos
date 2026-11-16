// Normalización de nombres de faltantes (RN-10): minúsculas, sin tildes y plural simple.
// Ejemplo: "Cofias" y "cofia" -> "cofia".
function normalizarNombre(nombre) {
  const base = String(nombre || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return base
    .split(' ')
    .map(singularizar)
    .join(' ');
}

function singularizar(palabra) {
  if (palabra.length <= 3) return palabra;
  if (palabra.endsWith('ces')) return `${palabra.slice(0, -3)}z`; // lápices -> lapiz
  if (palabra.endsWith('es') && /[^aeiou]es$/.test(palabra) && !palabra.endsWith('ses')) {
    return palabra.slice(0, -2); // colores -> color
  }
  if (palabra.endsWith('s') && !palabra.endsWith('ss')) return palabra.slice(0, -1); // cofias -> cofia
  return palabra;
}

module.exports = { normalizarNombre };
