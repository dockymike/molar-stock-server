import pool from './index.js'

/**
 * Execute a query with automatic retry and better error handling
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @param {number} retries - Number of retries (default: 3)
 * @returns {Promise} Query result
 */
export const query = async (text, params = [], retries = 3) => {
  let lastError
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const start = Date.now()
      const result = await pool.query(text, params)
      const duration = Date.now() - start
      
      // Log slow queries (over 1 second)
      if (duration > 1000) {
        console.warn(`Slow query detected (${duration}ms):`, text.substring(0, 100))
      }
      
      return result
    } catch (error) {
      lastError = error
      console.error(`Query attempt ${attempt} failed:`, error.message)
      
      // Don't retry on certain errors
      if (error.code === '23505' || // Unique constraint violation
          error.code === '23503' || // Foreign key violation
          error.code === '42P01' || // Table doesn't exist
          error.code === '42703') { // Column doesn't exist
        throw error
      }
      
      // Wait before retrying (exponential backoff)
      if (attempt < retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
        console.log(`Retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }
  
  throw lastError
}

/**
 * Execute a transaction with automatic retry and rollback
 * @param {Function} callback - Function that performs database operations
 * @param {number} retries - Number of retries (default: 3)
 * @returns {Promise} Transaction result
 */
export const transaction = async (callback, retries = 3) => {
  let lastError
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    const client = await pool.connect()
    
    try {
      await client.query('BEGIN')
      const result = await callback(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      lastError = error
      console.error(`Transaction attempt ${attempt} failed:`, error.message)
      
      try {
        await client.query('ROLLBACK')
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError.message)
      }
      
      // Don't retry on certain errors
      if (error.code === '23505' || // Unique constraint violation
          error.code === '23503' || // Foreign key violation
          error.code === '42P01' || // Table doesn't exist
          error.code === '42703') { // Column doesn't exist
        throw error
      }
      
      // Wait before retrying (exponential backoff)
      if (attempt < retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
        console.log(`Retrying transaction in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    } finally {
      client.release()
    }
  }
  
  throw lastError
}

/**
 * Get connection pool status
 * @returns {Object} Pool status information
 */
export const getPoolStatus = () => {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount
  }
}

/**
 * Test database connection
 * @returns {Promise<boolean>} Connection status
 */
export const testConnection = async () => {
  try {
    const result = await query('SELECT NOW() as current_time')
    console.log('Database connection test successful:', result.rows[0].current_time)
    return true
  } catch (error) {
    console.error('Database connection test failed:', error.message)
    return false
  }
}
