import { ValidationError } from './errors.js';
import { isValidDate, isValidTime } from './time.js';

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;

export function formatPhone(raw) {
  const digits = String(raw).replace(/\D/g, '');
  const d = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return String(raw).trim();
}

/**
 * Collects field errors while reading a request body, then throws a single
 * 422 with every problem at once (so forms can highlight all fields).
 */
export function validate(body) {
  const src = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const errors = {};
  const fail = (key, msg) => {
    if (!errors[key]) errors[key] = msg;
  };

  const v = {
    errors,
    has: (key) => Object.prototype.hasOwnProperty.call(src, key),

    text(key, { required = false, max = 200, min = 0, label = 'This field', multiline = false } = {}) {
      let val = src[key];
      if (val == null) val = '';
      if (typeof val !== 'string' && typeof val !== 'number') {
        fail(key, `${label} is invalid.`);
        return '';
      }
      val = String(val).replace(CONTROL_CHARS, '');
      val = multiline ? val.replace(/\r\n?/g, '\n').trim() : val.replace(/\s+/g, ' ').trim();
      if (!val) {
        if (required) fail(key, `${label} is required.`);
        return '';
      }
      if (val.length < min) fail(key, `${label} must be at least ${min} characters.`);
      if (val.length > max) fail(key, `${label} must be ${max} characters or fewer.`);
      return val;
    },

    email(key, { required = false, label = 'Email' } = {}) {
      const val = v.text(key, { required, max: 254, label }).toLowerCase();
      if (val && !EMAIL_RE.test(val)) fail(key, 'Please enter a valid email address.');
      return val;
    },

    phone(key, { required = false, label = 'Phone number' } = {}) {
      const val = v.text(key, { required, max: 30, label });
      if (!val) return '';
      const digits = val.replace(/\D/g, '');
      if (!/^[+\d\s().-]+$/.test(val) || digits.length < 10 || digits.length > 15) {
        fail(key, 'Please enter a valid phone number, including area code.');
        return val;
      }
      return formatPhone(val);
    },

    int(key, { required = false, min = -Infinity, max = Infinity, label = 'This field' } = {}) {
      const raw = src[key];
      if (raw == null || raw === '') {
        if (required) fail(key, `${label} is required.`);
        return null;
      }
      const n = typeof raw === 'number' ? raw : /^-?\d+$/.test(String(raw).trim()) ? Number(raw) : NaN;
      if (!Number.isInteger(n)) {
        fail(key, `${label} must be a whole number.`);
        return null;
      }
      if (n < min || n > max) {
        fail(key, `${label} must be between ${min} and ${max}.`);
        return null;
      }
      return n;
    },

    /** Optional positive id; "any", "", null → null. */
    id(key, { required = false, label = 'This field' } = {}) {
      const raw = src[key];
      if (raw == null || raw === '' || raw === 'any') {
        if (required) fail(key, `${label} is required.`);
        return null;
      }
      return v.int(key, { min: 1, max: Number.MAX_SAFE_INTEGER, label });
    },

    /** Dollar amount → integer cents, or null when blank. */
    money(key, { label = 'Price' } = {}) {
      const raw = src[key];
      if (raw == null || raw === '') return null;
      const s = String(raw).replace(/[$,\s]/g, '');
      if (!/^\d{1,5}(\.\d{1,2})?$/.test(s)) {
        fail(key, `${label} must be a dollar amount like 35 or 35.50.`);
        return null;
      }
      return Math.round(Number(s) * 100);
    },

    bool(key) {
      const raw = src[key];
      return raw === true || raw === 1 || raw === '1' || raw === 'true' || raw === 'on';
    },

    date(key, { required = true, label = 'Date' } = {}) {
      const raw = src[key];
      if (raw == null || raw === '') {
        if (required) fail(key, `${label} is required.`);
        return null;
      }
      if (!isValidDate(raw)) {
        fail(key, `${label} is not a valid date.`);
        return null;
      }
      return raw;
    },

    time(key, { required = true, label = 'Time' } = {}) {
      const raw = src[key];
      if (raw == null || raw === '') {
        if (required) fail(key, `${label} is required.`);
        return null;
      }
      if (!isValidTime(raw)) {
        fail(key, `${label} is not a valid time.`);
        return null;
      }
      return raw;
    },

    oneOf(key, allowed, { required = true, label = 'This field', fallback = null } = {}) {
      const raw = src[key];
      if (raw == null || raw === '') {
        if (required) fail(key, `${label} is required.`);
        return fallback;
      }
      if (!allowed.includes(raw)) {
        fail(key, `${label} is invalid.`);
        return fallback;
      }
      return raw;
    },

    /** Validate a URL that must be http(s). Blank allowed. */
    url(key, { label = 'URL' } = {}) {
      const val = v.text(key, { max: 500, label });
      if (!val) return '';
      try {
        const u = new URL(val);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error();
        return u.toString();
      } catch {
        fail(key, `${label} must be a full web address starting with https://`);
        return '';
      }
    },

    fail,

    /** Throws a ValidationError if anything failed. */
    done() {
      if (Object.keys(errors).length) throw new ValidationError(errors);
    },
  };
  return v;
}
