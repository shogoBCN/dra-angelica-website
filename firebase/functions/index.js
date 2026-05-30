import { initializeApp } from "firebase-admin/app";
import { defineSecret } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import { Resend } from "resend";
import { buildContactEmail, parseContactPayload } from "./contact.js";
import { corsHeaders, isAllowedOrigin } from "./cors.js";

initializeApp();

const resendApiKey = defineSecret("RESEND_API_KEY");
const contactToEmail = defineSecret("CONTACT_TO_EMAIL");
const contactFromEmail = defineSecret("CONTACT_FROM_EMAIL");

const MAX_BODY_BYTES = 12_000;

/**
 * @param {import("firebase-functions/v2/https").Request} req
 * @param {import("firebase-functions/v2/https").Response} res
 * @param {Record<string, string>} extraHeaders
 */
function sendJson(res, status, payload, extraHeaders = {}) {
  res
    .set({ "Content-Type": "application/json; charset=utf-8", ...extraHeaders })
    .status(status)
    .send(JSON.stringify(payload));
}

export const submitContact = onRequest(
  {
    region: "southamerica-east1",
    secrets: [resendApiKey, contactToEmail, contactFromEmail],
    timeoutSeconds: 30,
    memory: "256MiB",
    maxInstances: 10,
  },
  async (req, res) => {
    const cors = corsHeaders(req);

    if (req.method === "OPTIONS") {
      if (!isAllowedOrigin(req)) {
        res.status(403).end();
        return;
      }
      res.set({ ...cors, "Access-Control-Max-Age": "86400" }).status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, { success: false, message: "Método no permitido." }, cors);
      return;
    }

    if (!isAllowedOrigin(req)) {
      sendJson(res, 403, { success: false, message: "Origen no permitido." }, cors);
      return;
    }

    const rawBody = req.rawBody;
    if (!rawBody || rawBody.length > MAX_BODY_BYTES) {
      sendJson(res, 413, { success: false, message: "Solicitud demasiado grande." }, cors);
      return;
    }

    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        sendJson(res, 400, { success: false, message: "Datos del formulario no válidos." }, cors);
        return;
      }
    }

    const parsed = parseContactPayload(body);
    if (!parsed.ok) {
      sendJson(res, 200, { success: false, message: parsed.message }, cors);
      return;
    }

    if (parsed.data.honey.length > 0) {
      sendJson(res, 200, { success: true }, cors);
      return;
    }

    const to = contactToEmail.value().trim();
    const fromAddress = contactFromEmail.value().trim();
    if (!to || !fromAddress) {
      console.error("submitContact: missing CONTACT_TO_EMAIL or CONTACT_FROM_EMAIL secret");
      sendJson(
        res,
        500,
        { success: false, message: "El envío no está configurado. Inténtalo más tarde." },
        cors
      );
      return;
    }

    const from =
      fromAddress.includes("<") ? fromAddress : `Consultorio <${fromAddress}>`;
    const { subject, text } = buildContactEmail(parsed.data);

    try {
      const resend = new Resend(resendApiKey.value());
      const { error } = await resend.emails.send({
        from,
        to: [to],
        replyTo: parsed.data.email,
        subject,
        text,
      });

      if (error) {
        console.error("submitContact: Resend error", error.message);
        sendJson(
          res,
          500,
          { success: false, message: "No se pudo enviar el mensaje. Inténtalo de nuevo." },
          cors
        );
        return;
      }

      sendJson(res, 200, { success: true }, cors);
    } catch (err) {
      console.error("submitContact: unexpected error", err);
      sendJson(
        res,
        500,
        { success: false, message: "No se pudo enviar el mensaje. Inténtalo de nuevo." },
        cors
      );
    }
  }
);
