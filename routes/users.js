import express from 'express'
import pool from '../db/index.js'
import jwt from 'jsonwebtoken'
import { hashPassword, comparePasswords } from '../auth/hash.js'
import { verifyToken } from '../auth/verifyToken.js'

const router = express.Router()

// ✅ TEST: Simple cookie test endpoint (no auth required)
router.get('/test-cookie', (req, res) => {
  
  res.cookie('testCookie', 'testValue', {
    httpOnly: false,  // Make it visible to JS for testing
    maxAge: 60000,    // 1 minute
    path: '/'
  })
  
  res.json({ message: 'Test cookie set' })
})


// ✅ GET /me - Return current logged-in user from JWT
router.get('/me', verifyToken, async (req, res) => {
  const userId = req.user.id

  try {
    const result = await pool.query(
      'SELECT id, email, practice_name, is_paid, dark_mode FROM users WHERE id = $1',
      [userId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    res.json({ user: result.rows[0] })
  } catch (err) {
    console.error('Error fetching /me user:', err)
    res.status(500).json({ error: 'Could not fetch user info' })
  }
})





// ✅ REGISTER a new user
router.post('/register', async (req, res) => {
  const { email, password, practice_name } = req.body

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const hashed = await hashPassword(password)

    const result = await client.query(
      'INSERT INTO users (email, password_hash, practice_name) VALUES ($1, $2, $3) RETURNING id, email, practice_name',
      [email, hashed, practice_name]
    )

    const newUser = result.rows[0]

    // ✅ Insert default "Common Area" location for this user
    await client.query(
      'INSERT INTO locations (user_id, name, protected) VALUES ($1, $2, $3)',
      [newUser.id, 'Common Area', true]
    )

    await client.query('COMMIT')

    res.json(newUser)
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Error registering user:', err)
    
    // Handle specific database errors
    if (err.code === '23505' && err.constraint === 'users_email_key') {
      return res.status(400).json({ error: 'Email already exists. Please use a different email.' })
    }
    
    res.status(500).json({ error: 'Registration failed' })
  } finally {
    client.release()
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

    // Set httpOnly cookie with proper configuration

    res.cookie('authToken', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
      path: '/'
    })


    const responsePayload = {
      user: {
        id: user.id,
        email: user.email,
        practice_name: user.practice_name,
        is_paid: user.is_paid,
        dark_mode: user.dark_mode,
      },
    }

    res.json(responsePayload)
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
      'SELECT id, email, practice_name, is_paid, dark_mode FROM users WHERE id = $1',
      [userId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    const user = result.rows[0]
    res.json(user)
  } catch (err) {
    console.error('Error fetching user:', err)
    res.status(500).json({ error: 'Could not fetch user' })
  }
})


// ✅ LOGOUT: Clear httpOnly cookie
router.post('/logout', (req, res) => {
  res.clearCookie('authToken', {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax', 
    path: '/', // <-- match the same path used in res.cookie
  })
  res.json({ success: true })
})

// ✅ PATCH: Update dark mode preference
router.patch('/dark-mode', verifyToken, async (req, res) => {
  const { dark_mode } = req.body
  const userId = req.user.id

  try {
    await pool.query(
      'UPDATE users SET dark_mode = $1 WHERE id = $2',
      [dark_mode, userId]
    )
    res.json({ success: true })
  } catch (err) {
    console.error('Failed to update dark mode:', err)
    res.status(500).json({ error: 'Failed to update preference' })
  }
})


export default router
