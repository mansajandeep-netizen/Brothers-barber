import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { smtpSend, confirmationEmail } from '../server/lib/mailer.js';
import { appointmentIcs } from '../server/lib/ics.js';
import { DEFAULT_BUSINESS } from '../server/seed-data.js';

/** Minimal in-process SMTP server that records one message. */
function fakeSmtp() {
  const received = { commands: [], data: '' };
  const server = net.createServer((sock) => {
    let inData = false;
    let buf = '';
    sock.write('220 fake.local ESMTP\r\n');
    sock.on('data', (chunk) => {
      buf += chunk.toString();
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            sock.write('250 queued\r\n');
          } else received.data += `${line}\n`;
          continue;
        }
        received.commands.push(line.split(' ')[0]);
        if (/^EHLO/.test(line)) sock.write('250-fake.local\r\n250 AUTH PLAIN\r\n');
        else if (/^AUTH PLAIN/.test(line)) sock.write('235 ok\r\n');
        else if (/^(MAIL|RCPT)/.test(line)) sock.write('250 ok\r\n');
        else if (line === 'DATA') {
          inData = true;
          sock.write('354 go ahead\r\n');
        } else if (line === 'QUIT') {
          sock.write('221 bye\r\n');
          sock.end();
        }
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, received, port: server.address().port })));
}

const appt = {
  reference: 'BB-TEST42',
  token: 'tok_abcdefghijklmnopqrstuvwxyz',
  serviceName: 'Fade Cut',
  barberName: 'Barber 1',
  date: '2026-10-06',
  startMin: 600,
  endMin: 630,
  status: 'booked',
  customer: { name: 'Jordan Smith', email: 'jordan@example.com', phone: '(780) 555-0199' },
};

test('sends a multipart email over SMTP with AUTH', async () => {
  const { server, received, port } = await fakeSmtp();
  const email = confirmationEmail(appt, DEFAULT_BUSINESS, 'https://example.com');
  await smtpSend(
    { host: '127.0.0.1', port, secure: false, user: 'user', pass: 'pass' },
    { from: 'Brothers Barber Shop <bookings@example.com>', to: 'jordan@example.com', ...email },
  );
  server.close();
  assert.deepEqual(received.commands, ['EHLO', 'AUTH', 'MAIL', 'RCPT', 'DATA', 'QUIT']);
  assert.match(received.data, /Subject: =\?UTF-8\?B\?/); // non-ASCII apostrophe is encoded
  assert.match(received.data, /multipart\/alternative/);
  const textPart = received.data.split('Content-Transfer-Encoding: base64\n\n')[1].split('\n--')[0].replace(/\n/g, '');
  assert.match(Buffer.from(textPart, 'base64').toString(), /BB-TEST42/);
});

test('calendar file uses UTC times and escapes text', () => {
  const ics = appointmentIcs(appt, DEFAULT_BUSINESS, { timezone: 'America/Edmonton', siteHost: 'example.com' });
  assert.match(ics, /DTSTART:20261006T160000Z/);
  assert.match(ics, /DTEND:20261006T163000Z/);
  assert.match(ics, /LOCATION:9701 84 Ave #2\\, Grande Prairie\\, AB T8V 4Z8/);
  assert.ok(ics.split('\r\n').every((line) => Buffer.byteLength(line) <= 75));
});
