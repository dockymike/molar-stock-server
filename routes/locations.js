// ✅ src/routes/locations.js
import express from 'express'
import pool from '../db/index.js'
import { verifyToken } from '../auth/verifyToken.js'
import { asyncHandler } from '../middleware/errorHandler.js'

const router = express.Router()

router.use(verifyToken)

// ✅ Create a new location
router.post('/', asyncHandler(async (req, res) => {
  const { name, protected: isProtected = false } = req.body
  const user_id = req.user.id

  const result = await pool.query(
    'INSERT INTO locations (user_id, name, protected) VALUES ($1, $2, $3) RETURNING *',
    [user_id, name, isProtected]
  )
  res.json(result.rows[0])
}))

// ✅ Get all locations for the current user
router.get('/', asyncHandler(async (req, res) => {
  const user_id = req.user.id

  const result = await pool.query(
    'SELECT * FROM locations WHERE user_id = $1 ORDER BY id',
    [user_id]
  )
  res.json(result.rows)
}))

// ✅ Update a location (prevent if protected)
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  const { name } = req.body

  const check = await pool.query('SELECT protected FROM locations WHERE id = $1', [id])
  if (check.rows.length === 0) {
    return res.status(404).json({ error: 'Location not found' })
  }
  if (check.rows[0].protected) {
    return res.status(403).json({ error: 'This location is protected and cannot be updated' })
  }

  const result = await pool.query(
    'UPDATE locations SET name = $1 WHERE id = $2 RETURNING *',
    [name, id]
  )
  res.json(result.rows[0])
}))

// ✅ Delete a location (prevent if protected)
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params

  const check = await pool.query('SELECT protected FROM locations WHERE id = $1', [id])
  if (check.rows.length === 0) {
    return res.status(404).json({ error: 'Location not found' })
  }
  if (check.rows[0].protected) {
    return res.status(403).json({ error: 'This location is protected and cannot be deleted' })
  }

  try {
    await pool.query('DELETE FROM locations WHERE id = $1', [id])
    res.json({ success: true })
  } catch (err) {
    console.error('Error deleting location:', err)

    if (err.code === '23503' && err.constraint === 'location_inventory_location_id_fkey') {
      return res.status(400).json({
        error:
          'This location still has inventory assigned. Move or delete that inventory before deleting.',
      })
    }

    res.status(500).json({ error: 'Could not delete location' })
  }
}))

export default router
