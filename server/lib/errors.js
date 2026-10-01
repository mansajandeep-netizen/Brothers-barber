export class HttpError extends Error {
  /**
   * @param {number} status HTTP status code
   * @param {string} message Safe, human-readable message shown to the user
   * @param {object} [extra] Extra JSON fields, e.g. { code, fields }
   */
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export class ValidationError extends HttpError {
  constructor(fields, message = 'Please check the highlighted fields.') {
    super(422, message, { code: 'VALIDATION', fields });
  }
}
