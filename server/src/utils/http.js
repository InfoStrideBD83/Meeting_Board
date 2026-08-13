/**
 * Wraps an async route handler so thrown errors flow to Express' error handler
 * instead of crashing the process or hanging the request.
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/** A small typed error carrying an HTTP status code. */
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
