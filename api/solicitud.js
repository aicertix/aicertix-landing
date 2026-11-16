// POST /api/solicitud
// Saves a request in Supabase (table + optional file in Storage) and emails it to the team.
// Secrets come from Vercel environment variables; nothing secret lives in the browser.
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

const MAX_FILE_BYTES = 3 * 1024 * 1024; // Vercel caps request bodies at 4.5 MB; base64 adds a third
const FILE_TYPES = {
  pdf: 'application/pdf',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
};
const BUCKET = 'solicitudes';
const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];

const clean = (v, max) => (typeof v === 'string' ? v.replace(/\u0000/g, '').trim().slice(0, max) : '');
const oneLine = (v, max) => clean(v, max).replace(/[\r\n]+/g, ' ');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method' });
  }
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error('solicitud: missing environment variables:', missing.join(', '));
    return res.status(500).json({ ok: false, error: 'config' });
  }

  const b = req.body && typeof req.body === 'object' ? req.body : {};
  if (clean(b.website, 200)) return res.status(200).json({ ok: true }); // honeypot: bots fill it, people never see it

  const data = {
    nombre: oneLine(b.nombre, 120),
    empresa: oneLine(b.empresa, 160),
    correo: oneLine(b.correo, 200).toLowerCase(),
    pais_destino: oneLine(b.pais_destino, 160),
    puerto_origen: oneLine(b.puerto_origen, 120),
    detalle: clean(b.detalle, 5000),
    idioma: b.idioma === 'en' ? 'en' : 'es',
    consentimiento: b.consentimiento === true,
  };
  const invalid = [];
  if (!data.nombre) invalid.push('nombre');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.correo)) invalid.push('correo');
  if (!data.detalle) invalid.push('detalle');
  if (!data.consentimiento) invalid.push('consentimiento');
  if (invalid.length) return res.status(400).json({ ok: false, error: 'validation', fields: invalid });

  // Optional attachment, sent as base64
  let file = null;
  if (b.archivo && typeof b.archivo === 'object' && b.archivo.base64) {
    const name = oneLine(b.archivo.nombre, 140).replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]/g, '_');
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (!FILE_TYPES[ext]) return res.status(400).json({ ok: false, error: 'file_type' });
    const buffer = Buffer.from(String(b.archivo.base64), 'base64');
    if (!buffer.length || buffer.length > MAX_FILE_BYTES) return res.status(400).json({ ok: false, error: 'file_size' });
    file = { name, ext, buffer, type: FILE_TYPES[ext] };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let archivo_path = null;
  if (file) {
    const stamp = new Date().toISOString().slice(0, 10);
    archivo_path = `${stamp}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${file.ext}`;
    const up = await supabase.storage.from(BUCKET).upload(archivo_path, file.buffer, { contentType: file.type, upsert: false });
    if (up.error) {
      console.error('solicitud: storage upload failed:', up.error.message);
      return res.status(502).json({ ok: false, error: 'storage' });
    }
  }

  const row = { ...data, archivo_path, archivo_nombre: file ? file.name : null, user_agent: oneLine(req.headers['user-agent'], 300) };
  const ins = await supabase.from('solicitudes').insert(row).select('id').single();
  if (ins.error) {
    console.error('solicitud: insert failed:', ins.error.message);
    return res.status(502).json({ ok: false, error: 'database' });
  }

  // The request is saved at this point. If the email fails we still answer ok and log it,
  // because the visitor's request is not lost.
  let emailed = true;
  try {
    const port = Number(process.env.SMTP_PORT || 465);
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transport.sendMail({
      from: `"AiCertix · Formulario web" <${process.env.SMTP_USER}>`,
      to: process.env.MAIL_TO || process.env.SMTP_USER,
      replyTo: `"${data.nombre.replace(/"/g, '')}" <${data.correo}>`,
      subject: `Solicitud de exportación — ${data.nombre}${data.empresa ? ' · ' + data.empresa : ''}${data.pais_destino ? ' · ' + data.pais_destino : ''}`,
      text: [
        `Nombre: ${data.nombre}`,
        `Empresa: ${data.empresa || '—'}`,
        `Correo: ${data.correo}`,
        `País de destino: ${data.pais_destino || '—'}`,
        `Puerto de origen en Perú: ${data.puerto_origen || '—'}`,
        `Idioma de la página: ${data.idioma}`,
        '',
        'Productos / detalle de la solicitud:',
        data.detalle,
        '',
        file ? `Archivo adjunto: ${file.name} (también guardado en Supabase: ${BUCKET}/${archivo_path})` : 'Sin archivo adjunto.',
        `Registro en Supabase: ${ins.data.id}`,
        '',
        'Responder a este correo escribe directamente al solicitante.',
      ].join('\n'),
      attachments: file ? [{ filename: file.name, content: file.buffer, contentType: file.type }] : [],
    });
  } catch (err) {
    emailed = false;
    console.error('solicitud: email failed (request saved as ' + ins.data.id + '):', err.message);
  }

  return res.status(200).json({ ok: true, id: ins.data.id, emailed });
};
