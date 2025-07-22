import express from 'express'
import { query } from '../db/utils.js'
import { verifyToken } from '../auth/verifyToken.js'
import { asyncHandler } from '../middleware/errorHandler.js'

const router = express.Router()

// ✅ GET current user from cookie (for session persistence)
router.get('/me', verifyToken, asyncHandler(async (req, res) => {
  const result = await query(
    'SELECT id, email, practice_name, is_paid, dark_mode FROM users WHERE id = $1',
    [req.user.id]
  )

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'User not found' })
  }

  const user = result.rows[0]
  res.json({ user })
}))

export default router
