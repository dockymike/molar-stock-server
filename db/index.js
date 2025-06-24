import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // required for Heroku SSL
  },
  max: 5, // ✅ limit number of connections your app can open
  idleTimeoutMillis: 10000, // ✅ close idle connections after 10 seconds
  connectionTimeoutMillis: 2000, // ✅ fail if can't connect within 2 seconds
})

export default pool
