import crypto from 'node:crypto';
import net from 'node:net';
import os from 'node:os';
import tls from 'node:tls';
import { formatDateLong, formatTime12 } from './time.js';

/**
 * Email delivery. Providers:
 *   resend  — https://resend.com HTTP API (RESEND_API_KEY)
 *   smtp    — any SMTP server, e.g. Google Workspace, Zoho, Amazon SES (SMTP_HOST, …)
 *   console — development default: emails are printed to the server log, not sent
 */
export function createMailer({ config, store, logger = console }) {
  const { provider, from, replyTo } = config.mail;
  const canSend = provider !== 'console' && !!from;
  if (provider !== 'console' && !from) logger.warn('[mail] MAIL_FROM is not set — emails will only be logged.');

  async function send({ to, subject, text, html }) {
    if (!to) return { sent: false };
    const effective = canSend ? provider : 'console';
    try {
      if (effective === 'resend') await sendResend({ to, subject, text, html });
      else if (effective === 'smtp') await sendSmtp({ to, subject, text, html });
      else logger.info(`\n[mail:console] To: ${to}\nSubject: ${subject}\n\n${text}\n`);
      store.emailLog.add({ to, subject, provider: effective, status: effective === 'console' ? 'logged' : 'sent' });
      return { sent: effective !== 'console' };
    } catch (err) {
      logger.error(`[mail] Failed to send "${subject}" to ${to}:`, err.message);
      store.emailLog.add({ to, subject, provider: effective, status: 'failed', error: String(err.message).slice(0, 500) });
      return { sent: false };
    }
  }

  async function sendResend({ to, subject, text, html }) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.mail.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Resend responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  async function sendSmtp({ to, subject, text, html }) {
    await smtpSend(config.mail.smtp, { from, to, replyTo, subject, text, html });
  }

  return { provider: canSend ? provider : 'console', canSend, send };
}

/* ------------------------------------------------------------------ */
/* Email content                                                       */
/* ------------------------------------------------------------------ */

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function emailShell(business, title, bodyHtml) {
  const address = `${business.streetAddress}, ${business.city}, ${business.region} ${business.postalCode}`;
  return `<!doctype html><html><body style="margin:0;background:#f1ece3;font-family:Helvetica,Arial,sans-serif;color:#151412">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1ece3;padding:32px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#0c0c0d;padding:28px 32px;text-align:center">
<div style="color:#f2eee6;font-size:20px;font-weight:800;letter-spacing:4px">BROTHERS</div>
<div style="color:#c9a46a;font-size:11px;letter-spacing:5px;margin-top:4px">BARBER SHOP</div>
</td></tr>
<tr><td style="padding:32px">
<h1 style="margin:0 0 16px;font-size:22px;color:#151412">${escapeHtml(title)}</h1>
${bodyHtml}
</td></tr>
<tr><td style="padding:20px 32px;background:#faf8f4;color:#6b655c;font-size:12px;line-height:1.6;text-align:center">
${escapeHtml(business.name)} · ${escapeHtml(address)}<br>
<a href="tel:${escapeHtml(business.phone.replace(/[^\d+]/g, ''))}" style="color:#9a7438">${escapeHtml(business.phone)}</a>
</td></tr>
</table></td></tr></table></body></html>`;
}

function detailRows(rows) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #ece6db;margin:8px 0 24px">
${rows
  .map(
    ([k, v]) => `<tr><td style="padding:10px 0;border-bottom:1px solid #ece6db;color:#6b655c;font-size:14px;width:38%">${escapeHtml(k)}</td>
<td style="padding:10px 0;border-bottom:1px solid #ece6db;font-size:14px;font-weight:600">${escapeHtml(v)}</td></tr>`,
  )
  .join('')}
</table>`;
}

const button = (href, label) =>
  `<a href="${escapeHtml(href)}" style="display:inline-block;background:#c9a46a;color:#15110a;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:1.5px;padding:14px 22px;border-radius:6px;margin:0 8px 8px 0">${escapeHtml(label)}</a>`;

function apptRows(appt) {
  return [
    ['Service', appt.serviceName],
    ['Barber', appt.barberName],
    ['Date', formatDateLong(appt.date)],
    ['Time', formatTime12(appt.startMin)],
    ['Reference', appt.reference],
  ];
}

export function confirmationEmail(appt, business, siteUrl) {
  const first = appt.customer.name.split(' ')[0];
  const manage = `${siteUrl}/appointment/${appt.token}`;
  const ics = `${siteUrl}/api/bookings/${appt.token}/calendar.ics`;
  const when = `${formatDateLong(appt.date)} at ${formatTime12(appt.startMin)}`;
  return {
    subject: `You’re booked: ${appt.serviceName}, ${when}`,
    text: [
      `Hi ${first},`,
      '',
      `Your appointment at ${business.name} is confirmed.`,
      '',
      ...apptRows(appt).map(([k, v]) => `${k}: ${v}`),
      '',
      `Address: ${business.streetAddress}, ${business.city}, ${business.region} ${business.postalCode}`,
      `Phone: ${business.phone}`,
      '',
      `Add to your calendar: ${ics}`,
      `Need to cancel? ${manage}`,
      '',
      'See you soon.',
    ].join('\n'),
    html: emailShell(
      business,
      'Appointment confirmed',
      `<p style="margin:0 0 8px;font-size:15px;line-height:1.6">Hi ${escapeHtml(first)}, you’re all set. Here are your booking details:</p>
${detailRows(apptRows(appt))}
<p style="margin:0 0 24px">${button(ics, 'ADD TO CALENDAR')}${button(manage, 'MANAGE BOOKING')}</p>
<p style="margin:0;font-size:13px;color:#6b655c;line-height:1.6">Need to cancel or change your appointment? Use the link above or call us at ${escapeHtml(business.phone)}.</p>`,
    ),
  };
}

export function cancellationEmail(appt, business, siteUrl) {
  const first = appt.customer.name.split(' ')[0];
  return {
    subject: `Appointment cancelled: ${appt.serviceName}, ${formatDateLong(appt.date)}`,
    text: [
      `Hi ${first},`,
      '',
      `Your appointment at ${business.name} has been cancelled.`,
      '',
      ...apptRows(appt).map(([k, v]) => `${k}: ${v}`),
      '',
      `Book again any time: ${siteUrl}/book`,
      `Questions? Call ${business.phone}.`,
    ].join('\n'),
    html: emailShell(
      business,
      'Appointment cancelled',
      `<p style="margin:0 0 8px;font-size:15px;line-height:1.6">Hi ${escapeHtml(first)}, this appointment has been cancelled:</p>
${detailRows(apptRows(appt))}
<p style="margin:0 0 8px">${button(`${siteUrl}/book`, 'BOOK AGAIN')}</p>`,
    ),
  };
}

export function shopNotificationEmail(appt, business, siteUrl, kind = 'new') {
  const label = kind === 'cancelled' ? 'Cancelled by customer' : 'New online booking';
  const rows = [
    ...apptRows(appt),
    ['Customer', appt.customer.name],
    ['Phone', appt.customer.phone],
    ['Email', appt.customer.email || '—'],
    ['Notes', appt.notes || '—'],
  ];
  return {
    subject: `${label}: ${appt.customer.name} — ${appt.serviceName}, ${formatDateLong(appt.date)} ${formatTime12(appt.startMin)}`,
    text: [`${label}`, '', ...rows.map(([k, v]) => `${k}: ${v}`), '', `Dashboard: ${siteUrl}/admin`].join('\n'),
    html: emailShell(business, label, `${detailRows(rows)}<p style="margin:0">${button(`${siteUrl}/admin`, 'OPEN DASHBOARD')}</p>`),
  };
}

/* ------------------------------------------------------------------ */
/* Minimal SMTP client (implicit TLS on 465, or STARTTLS on 587)       */
/* ------------------------------------------------------------------ */

const addrOf = (s) => (/<([^>]+)>/.exec(s)?.[1] ?? s).trim();
const encodeHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`);
const b64Lines = (s) => Buffer.from(s).toString('base64').replace(/.{76}/g, '$&\r\n');

function buildMessage({ from, to, replyTo, subject, text, html }) {
  const boundary = `b_${crypto.randomBytes(12).toString('hex')}`;
  const domain = addrOf(from).split('@')[1] || 'localhost';
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  return [
    ...headers,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64Lines(text),
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64Lines(html),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

class SmtpConnection {
  constructor(socket) {
    this.pending = [];
    this.waiters = [];
    this.attach(socket);
  }

  attach(socket) {
    this.socket = socket;
    this.buffer = '';
    this.lines = [];
    socket.setEncoding('utf8');
    socket.setTimeout(20000, () => socket.destroy(new Error('SMTP timeout')));
    socket.on('data', (d) => this.onData(d));
    socket.on('error', (e) => this.fail(e));
    socket.on('close', () => this.fail(new Error('SMTP connection closed')));
  }

  detach() {
    this.socket.removeAllListeners('data');
    this.socket.removeAllListeners('error');
    this.socket.removeAllListeners('close');
    this.socket.setTimeout(0);
  }

  onData(chunk) {
    this.buffer += chunk;
    let i;
    while ((i = this.buffer.indexOf('\r\n')) >= 0) {
      const line = this.buffer.slice(0, i);
      this.buffer = this.buffer.slice(i + 2);
      this.lines.push(line);
      if (/^\d{3}(?: |$)/.test(line)) {
        const response = { code: Number(line.slice(0, 3)), lines: this.lines };
        this.lines = [];
        const w = this.waiters.shift();
        if (w) w.resolve(response);
        else this.pending.push(response);
      }
    }
  }

  fail(err) {
    for (const w of this.waiters.splice(0)) w.reject(err);
    this.failed = err;
  }

  read() {
    if (this.pending.length) return Promise.resolve(this.pending.shift());
    if (this.failed) return Promise.reject(this.failed);
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  async expect(codes, label) {
    const r = await this.read();
    if (!codes.includes(r.code)) throw new Error(`SMTP ${label} failed: ${r.lines.join(' | ').slice(0, 300)}`);
    return r;
  }

  async cmd(line, codes, label = line.split(' ')[0]) {
    this.socket.write(`${line}\r\n`);
    return this.expect(codes, label);
  }
}

export async function smtpSend(opts, msg) {
  const { host, port, secure, user, pass } = opts;
  const socket = secure
    ? tls.connect({ host, port, servername: host })
    : net.connect({ host, port });
  const conn = new SmtpConnection(socket);
  const helo = os.hostname().replace(/[^a-zA-Z0-9.-]/g, '') || 'localhost';
  try {
    await conn.expect([220], 'greeting');
    let ehlo = await conn.cmd(`EHLO ${helo}`, [250]);
    if (!secure && ehlo.lines.some((l) => /STARTTLS/i.test(l))) {
      await conn.cmd('STARTTLS', [220]);
      conn.detach();
      const secured = tls.connect({ socket, servername: host });
      await new Promise((resolve, reject) => {
        secured.once('secureConnect', resolve);
        secured.once('error', reject);
      });
      conn.attach(secured);
      ehlo = await conn.cmd(`EHLO ${helo}`, [250]);
    }
    if (user) {
      const token = Buffer.from(`\0${user}\0${pass}`).toString('base64');
      await conn.cmd(`AUTH PLAIN ${token}`, [235], 'AUTH');
    }
    await conn.cmd(`MAIL FROM:<${addrOf(msg.from)}>`, [250]);
    await conn.cmd(`RCPT TO:<${addrOf(msg.to)}>`, [250, 251]);
    await conn.cmd('DATA', [354]);
    const body = buildMessage(msg).replace(/^\./gm, '..');
    await conn.cmd(`${body}\r\n.`, [250], 'message');
    await conn.cmd('QUIT', [221]).catch(() => {});
  } finally {
    conn.socket.destroy();
  }
}
