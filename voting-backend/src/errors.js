// Error types and the Express error handler.

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const badRequest = (msg, code = "BAD_REQUEST") => new HttpError(400, msg, code);
const unauthorized = (msg = "Please log in", code = "UNAUTHORIZED") => new HttpError(401, msg, code);
const forbidden = (msg = "You don't have permission to do that", code = "FORBIDDEN") => new HttpError(403, msg, code);
const notFound = (msg = "Not found", code = "NOT_FOUND") => new HttpError(404, msg, code);
const conflict = (msg, code = "CONFLICT") => new HttpError(409, msg, code);

/** Thrown by repositories when a unique constraint is violated. */
class DuplicateError extends Error {
  constructor(field) {
    super(`Duplicate ${field}`);
    this.field = field;
  }
}

/** Wraps an async route so thrown errors reach the error handler. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Request body is not valid JSON", code: "BAD_JSON" });
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server", code: "INTERNAL" });
}

module.exports = { HttpError, DuplicateError, badRequest, unauthorized, forbidden, notFound, conflict, asyncHandler, errorHandler };
