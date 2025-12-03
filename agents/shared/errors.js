/**
 * Standardized error response utilities
 * Provides consistent error formats across all API endpoints
 */

import logger from './logger.js';

/**
 * Standard error codes
 */
const ERROR_CODES = {
  // Client errors (4xx)
  INVALID_INPUT: 'INVALID_INPUT',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  INVALID_PATH: 'INVALID_PATH',
  UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
  
  // Server errors (5xx)
  SERVER_ERROR: 'SERVER_ERROR',
  OCR_FAILED: 'OCR_FAILED',
  PROCESSING_ERROR: 'PROCESSING_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE'
};

/**
 * Create standardized error response
 * @param {string} code - Error code from ERROR_CODES
 * @param {string} message - Human-readable error message
 * @param {string} requestId - Request tracking ID
 * @param {object} details - Additional error details
 * @returns {object} Standardized error response
 */
function createErrorResponse(code, message, requestId = null, details = {}) {
  const response = {
    success: false,
    error: {
      code,
      message,
      ...(requestId && { requestId }),
      timestamp: new Date().toISOString(),
      ...details
    }
  };
  
  // Log the error
  logger.error(message, requestId, { code, ...details });
  
  return response;
}

/**
 * Create standardized success response
 * @param {object} data - Response data
 * @param {string} requestId - Request tracking ID
 * @returns {object} Standardized success response
 */
function createSuccessResponse(data, requestId = null) {
  return {
    success: true,
    ...(requestId && { requestId }),
    data
  };
}

/**
 * Express error handler middleware
 * Catches all errors and returns standardized responses
 */
function errorHandlerMiddleware(err, req, res, next) {
  const requestId = req.requestId || logger.generateRequestId();
  
  // Handle known error types
  if (err.name === 'ValidationError') {
    return res.status(400).json(
      createErrorResponse(
        ERROR_CODES.VALIDATION_FAILED,
        'Validation failed',
        requestId,
        { errors: err.errors }
      )
    );
  }
  
  if (err.name === 'SyntaxError' && err.status === 400) {
    return res.status(400).json(
      createErrorResponse(
        ERROR_CODES.INVALID_INPUT,
        'Invalid JSON format',
        requestId
      )
    );
  }
  
  // Default server error
  logger.error('Unhandled error', requestId, { 
    error: err.message, 
    stack: err.stack 
  });
  
  return res.status(500).json(
    createErrorResponse(
      ERROR_CODES.SERVER_ERROR,
      process.env.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : err.message,
      requestId
    )
  );
}

/**
 * Request ID middleware
 * Attaches a unique request ID to each request
 */
function requestIdMiddleware(req, res, next) {
  req.requestId = req.headers['x-request-id'] || logger.generateRequestId();
  res.setHeader('X-Request-ID', req.requestId);
  next();
}

export {
  ERROR_CODES,
  createErrorResponse,
  createSuccessResponse,
  errorHandlerMiddleware,
  requestIdMiddleware
};
