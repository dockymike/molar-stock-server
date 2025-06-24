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
  console.log('\n📩 [POST /request-reset] Password reset requested')
  console.log('📧 Incoming email:', email)

  if (!email) {
    console.warn('⚠️ No email provided in request body')
    return res.status(400).json({ error: 'Email is required' })
  }

  try {
    console.log('🔍 Searching for user by email...')
    const result = await pool.query('SELECT id FROM users WHERE email = $1', [email])
    console.log('📄 Query result:', result.rows)

    if (result.rows.length === 0) {
      console.log('📭 No matching user found — sending silent success')
      return res.status(200).json({ message: 'If your email exists, a reset link was sent.' })
    }

    const user = result.rows[0]
    console.log('✅ User found:', user)

    console.log('🔐 Generating JWT token...')
    const token = jwt.sign(
      { id: user.id, email },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    )
    console.log('🪙 Token generated:', token)

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`
    console.log('🔗 Reset URL:', resetUrl)

    console.log('📤 Sending password reset email...')
    await sendResetEmail(email, resetUrl)

    console.log('✅ Email dispatch complete')
    res.json({ message: 'Reset link sent if the email is registered.' })
  } catch (err) {
    console.error('❌ Error in /request-reset route')
    console.error('🪵 Error details:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ===============================
// 🔐 POST /reset-password
// ===============================
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body
  console.log('\n🔑 [POST /reset-password] Password update request')
  console.log('📦 Token provided:', token ? '[REDACTED]' : '❌ None')
  console.log('🔒 New password received:', newPassword ? '✅' : '❌ None')

  if (!token || !newPassword) {
    console.warn('⚠️ Missing token or new password in request')
    return res.status(400).json({ error: 'Token and new password required' })
  }

  try {
    console.log('🔍 Verifying token...')
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    console.log('✅ Token valid. Decoded payload:', decoded)

    console.log('🔐 Hashing new password...')
    const hashed = await hashPassword(newPassword)
    console.log('🔑 Hashed password:', hashed.slice(0, 10) + '...')

    console.log('🛠️ Updating password in DB...')
    const updateResult = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [hashed, decoded.id]
    )

    console.log('✅ DB update result:', updateResult.rowCount, 'row(s) affected')
    res.json({ message: 'Password updated successfully' })
  } catch (err) {
    console.error('❌ Error in /reset-password route')
    if (err.name === 'TokenExpiredError') {
      console.error('⏰ Token has expired')
      return res.status(400).json({ error: 'Token has expired' })
    } else if (err.name === 'JsonWebTokenError') {
      console.error('🛑 Invalid token:', err.message)
      return res.status(400).json({ error: 'Invalid token' })
    }

    console.error('🪵 Error details:', err)
    res.status(400).json({ error: 'Invalid or expired token' })
  }
})

// ===============================
// 🧪 TEST ROUTE
// ===============================
router.get('/test', (req, res) => {
  console.log('🧪 [GET /request-reset/test] Route hit successfully')
  res.json({ message: '✅ Password reset route is working' })
})

export default router
