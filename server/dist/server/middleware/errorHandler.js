"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleGlobalErrors = handleGlobalErrors;
/**
 * Global error handling middleware.
 * Catches errors passed via next(err) and prevents client aborts/too large payloads
 * from cluttering the server logs with stack traces.
 */
function handleGlobalErrors(err, req, res, next) {
    // If headers have already been sent to the client, delegate to the default Express error handler
    if (res.headersSent) {
        return next(err);
    }
    const status = err.status || err.statusCode || 500;
    // Handle "request aborted" (client closed connection prematurely before full body was sent)
    if (err.code === 'REQUEST_ABORTED' || (status === 400 && err.message === 'request aborted')) {
        console.warn(`⚠️  Client aborted request: ${req.method} ${req.originalUrl}`);
        res.status(400).json({ error: 'Request aborted by client' });
        return;
    }
    // Handle large payloads (PayloadTooLargeError)
    if (err.type === 'entity.too.large' || status === 413) {
        console.warn(`⚠️  Payload too large: ${req.method} ${req.originalUrl} (${err.message})`);
        res.status(413).json({ error: 'Request payload too large' });
        return;
    }
    // Default error reporting (log full details for server-side exceptions)
    console.error(`❌ Global error handler caught:`, err);
    res.status(status).json({
        error: err.message || 'Internal Server Error'
    });
}
