const MAX_NAME = 120;
const MAX_EMAIL = 254;
const MAX_PHONE = 40;
const MIN_MESSAGE = 10;
const MAX_MESSAGE = 4000;

const EMAIL_RE =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @param {unknown} body
 * @returns {{ ok: true, data: { name: string, email: string, telefono: string, mensaje: string, honey: string } } | { ok: false, message: string }}
 */
export function parseContactPayload(body) {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "Datos del formulario no válidos." };
  }

  const record = /** @type {Record<string, unknown>} */ (body);
  const name = String(record.name ?? "").trim();
  const email = String(record.email ?? "").trim();
  const telefono = String(record.telefono ?? "").trim();
  const mensaje = String(record.mensaje ?? "").trim();
  const honey = String(record._honey ?? "").trim();

  if (name.length < 1 || name.length > MAX_NAME) {
    return { ok: false, message: "Indica tu nombre (máximo 120 caracteres)." };
  }
  if (!email || email.length > MAX_EMAIL || !EMAIL_RE.test(email)) {
    return { ok: false, message: "Indica un correo electrónico válido." };
  }
  if (telefono.length > MAX_PHONE) {
    return { ok: false, message: "El teléfono es demasiado largo." };
  }
  if (mensaje.length < MIN_MESSAGE || mensaje.length > MAX_MESSAGE) {
    return {
      ok: false,
      message: `El mensaje debe tener entre ${MIN_MESSAGE} y ${MAX_MESSAGE} caracteres.`,
    };
  }

  return { ok: true, data: { name, email, telefono, mensaje, honey } };
}

/**
 * @param {{ name: string, email: string, telefono: string, mensaje: string }} data
 * @returns {{ subject: string, text: string }}
 */
export function buildContactEmail(data) {
  const lines = [
    "Nuevo mensaje desde medicina-familiar.co",
    "",
    `Nombre: ${data.name}`,
    `Correo: ${data.email}`,
    `Teléfono: ${data.telefono || "(no indicado)"}`,
    "",
    "Mensaje:",
    data.mensaje,
    "",
    `Enviado: ${new Date().toISOString()}`,
  ];
  return {
    subject: "Mensaje desde la web (medicina-familiar.co)",
    text: lines.join("\n"),
  };
}
