/**
 * Tiny auto-escaping HTML templating. Interpolated values are escaped unless
 * they are SafeHtml (produced by `html` or `raw`), so components compose safely.
 */
class SafeHtml {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

function render(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof SafeHtml) return v.value;
  if (Array.isArray(v)) return v.map(render).join('');
  return escapeHtml(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

/** Marks a trusted string as HTML. Never pass user input to this. */
export const raw = (s) => new SafeHtml(String(s));

/** JSON for embedding in <script type="application/json|ld+json">. */
export const jsonScript = (data) =>
  raw(JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026'));
