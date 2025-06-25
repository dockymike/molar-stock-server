import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // ✅ Heroku uses this
  ssl: { rejectUnauthorized: false },
  max: 1, // ✅ PgBouncer handles pooling
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 2000,
})

export default pool
