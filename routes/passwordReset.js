// ✅ routes/passwordReset.js
import express from 'express'
import jwt from 'jsonwebtoken'
import pool from '../db/index.js'
import { hashPassword } from '../auth/hash.js'
import { sendResetEmail } from '../services/emailService.js'

const router = express.Router()

// ===============================
// 🔐 POST /request-reset
// ===============================
router.post('/request-reset', async (req, res) => {
  const { email } = req.body

  if (!email) {
    return res.status(400).json({ error: 'Email is required' })
  }

  try {
    const result = await pool.query('SELECT id FROM users WHERE email = $1', [email])

    if (result.rows.length === 0) {
      return res.status(200).json({ message: 'If your email exists, a reset link was sent.' })
    }

    const user = result.rows[0]

    const token = jwt.sign(
      { id: user.id, email },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    )

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`

    await sendResetEmail(email, resetUrl)

    res.json({ message: 'Reset link sent if the email is registered.' })
  } catch (err) {
    console.error('Error in /request-reset route')
    console.error('Error details:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ===============================
// 🔐 POST /reset-password
// ===============================
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body

  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password required' })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    const hashed = await hashPassword(newPassword)

    const updateResult = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [hashed, decoded.id]
    )

    res.json({ message: 'Password updated successfully' })
  } catch (err) {
    console.error('Error in /reset-password route')
    if (err.name === 'TokenExpiredError') {
      return res.status(400).json({ error: 'Token has expired' })
    } else if (err.name === 'JsonWebTokenError') {
      return res.status(400).json({ error: 'Invalid token' })
    }

    console.error('Error details:', err)
    res.status(400).json({ error: 'Invalid or expired token' })
  }
})

// ===============================
// 🧪 TEST ROUTE
// ===============================
router.get('/test', (req, res) => {
  res.json({ message: '✅ Password reset route is working' })
})

export default router
