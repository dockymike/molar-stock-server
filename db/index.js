import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Heroku uses this
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false, // Always use SSL for remote databases
  max: parseInt(process.env.DB_POOL_MAX) || (process.env.NODE_ENV === 'production' ? 20 : 10),
  min: parseInt(process.env.DB_POOL_MIN) || 1,
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 60000, // 60 seconds
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 30000, // 30 seconds
  acquireTimeoutMillis: 60000, // 60 seconds - increased timeout
  createTimeoutMillis: 30000, // 30 seconds - increased for slow connections
  destroyTimeoutMillis: 10000, // 10 seconds - increased cleanup time
  reapIntervalMillis: 5000, // Clean up every 5 seconds - less aggressive
  createRetryIntervalMillis: 500, // 500ms retry interval
  // Add keepalive settings for long-running connections
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000, // 10 seconds
})

// Add connection monitoring with better logging
pool.on('connect', (client) => {
  console.log('Database connection established')
  // Set statement timeout to prevent hanging queries
  client.query('SET statement_timeout = 30000') // 30 seconds
})

pool.on('acquire', () => {
  console.log('Database connection acquired from pool')
})

pool.on('remove', () => {
  console.log('Database connection removed from pool')
})

// Improved error handling - don't crash the app immediately
pool.on('error', (err, client) => {
  console.error('Database pool error:', err)

  // Only exit if it's a critical connection error
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    console.error('Critical database connection error. Exiting...')
    setTimeout(() => process.exit(-1), 5000) // Give 5 seconds for cleanup
  } else {
    console.log('Non-critical database error, continuing...')
  }
})

// Graceful shutdown with better cleanup
const gracefulShutdown = (signal) => {
  console.log(`Received ${signal}. Gracefully shutting down...`)

  pool.end((err) => {
    if (err) {
      console.error('Error during pool shutdown:', err)
    } else {
      console.log('Database pool closed successfully')
    }
    process.exit(0)
  })
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

// Add periodic connection health check
setInterval(async () => {
  try {
    const client = await pool.connect()
    await client.query('SELECT 1')
    client.release()
  } catch (err) {
    console.error('Database health check failed:', err)
  }
}, 60000) // Check every minute

export default pool
