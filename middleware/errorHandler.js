/**
 * Global error handler middleware for Express
 * Handles database errors and other common errors gracefully
 */
export const errorHandler = (err, req, res, next) => {
  console.error('Error occurred:', {
    message: err.message,
    code: err.code,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  })

  // Database connection errors
  if (err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET' || err.code === 'ENOTFOUND') {
    return res.status(503).json({
      error: 'Database connection error. Please try again in a moment.',
      code: 'DB_CONNECTION_ERROR'
    })
  }

  // PostgreSQL specific errors
  switch (err.code) {
    case '23505': // Unique constraint violation
      return res.status(409).json({
        error: 'A record with this information already exists.',
        code: 'DUPLICATE_RECORD'
      })
    
    case '23503': // Foreign key violation
      return res.status(400).json({
        error: 'Referenced record does not exist.',
        code: 'INVALID_REFERENCE'
      })
    
    case '23502': // Not null violation
      return res.status(400).json({
        error: 'Required field is missing.',
        code: 'MISSING_REQUIRED_FIELD'
      })
    
    case '42P01': // Table doesn't exist
      return res.status(500).json({
        error: 'Database schema error. Please contact support.',
        code: 'SCHEMA_ERROR'
      })
    
    case '42703': // Column doesn't exist
      return res.status(500).json({
        error: 'Database schema error. Please contact support.',
        code: 'SCHEMA_ERROR'
      })
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Invalid authentication token.',
      code: 'INVALID_TOKEN'
    })
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Authentication token has expired.',
      code: 'TOKEN_EXPIRED'
    })
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: err.message,
      code: 'VALIDATION_ERROR'
    })
  }

  // Default error response
  const statusCode = err.statusCode || err.status || 500
  const message = statusCode === 500 
    ? 'An unexpected error occurred. Please try again.' 
    : err.message

  res.status(statusCode).json({
    error: message,
    code: 'INTERNAL_ERROR'
  })
}

/**
 * Async error wrapper to catch async errors in route handlers
 */
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

/**
 * Database health check middleware
 */
export const dbHealthCheck = async (req, res, next) => {
  try {
    // Simple health check query
    const { query } = await import('../db/utils.js')
    await query('SELECT 1')
    next()
  } catch (error) {
    console.error('Database health check failed:', error)
    return res.status(503).json({
      error: 'Database is currently unavailable. Please try again later.',
      code: 'DB_UNAVAILABLE'
    })
  }
}
