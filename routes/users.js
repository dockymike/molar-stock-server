import express from 'express'
import pool from '../db/index.js'
import jwt from 'jsonwebtoken'
import { hashPassword, comparePasswords } from '../auth/hash.js'
import { verifyToken } from '../auth/verifyToken.js'

const router = express.Router()

// ✅ REGISTER a new user
router.post('/register', async (req, res) => {
  const { email, password, practice_name } = req.body

  try {
    const hashed = await hashPassword(password)
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, practice_name) VALUES ($1, $2, $3) RETURNING id, email, practice_name',
      [email, hashed, practice_name]
    )
    res.json(result.rows[0])
  } catch (err) {
    console.error('Error registering user:', err)
    res.status(500).json({ error: 'Registration failed' })
  }
})

// ✅ LOGIN existing user
router.post('/login', async (req, res) => {
  const { email, password } = req.body

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    )

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const user = result.rows[0]
    const isMatch = await comparePasswords(password, user.password_hash)

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    )

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        practice_name: user.practice_name,
        is_paid: user.is_paid // ✅ include is_paid if you have this column
      }
    })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: 'Login failed' })
  }
})

// ✅ GET user by ID (for re-fetching after Stripe checkout success)
router.get('/:userId', verifyToken, async (req, res) => {
  const { userId } = req.params
  try {
    const result = await pool.query(
      'SELECT id, email, practice_name, is_paid FROM users WHERE id = $1',
      [userId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    res.json(result.rows[0])
  } catch (err) {
    console.error('Error fetching user:', err)
    res.status(500).json({ error: 'Could not fetch user' })
  }
})

export default router
