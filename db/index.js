import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5, // go back to 5 for default behavior
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 2000,
})

export default pool
