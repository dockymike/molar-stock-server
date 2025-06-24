import express from 'express'
import pool from '../db/index.js'
import { verifyToken } from '../auth/verifyToken.js'

const router = express.Router()

// 🔐 Protect all routes
router.use(verifyToken)

// ✅ Create a procedure
router.post('/', async (req, res) => {
  const { user_id, name } = req.body
  try {
    const result = await pool.query(
      'INSERT INTO procedures (user_id, name) VALUES ($1, $2) RETURNING *',
      [user_id, name]
    )
    res.json(result.rows[0])
  } catch (err) {
    console.error('Error creating procedure:', err)
    res.status(500).json({ error: 'Could not create procedure' })
  }
})

// ✅ Get all procedures for a user
router.get('/:user_id', async (req, res) => {
  const { user_id } = req.params
  try {
    const result = await pool.query(
      'SELECT * FROM procedures WHERE user_id = $1 ORDER BY id',
      [user_id]
    )
    res.json(result.rows)
  } catch (err) {
    console.error('Error fetching procedures:', err)
    res.status(500).json({ error: 'Could not fetch procedures' })
  }
})

// ✅ Update procedure name
router.put('/:id', async (req, res) => {
  const { id } = req.params
  const { name } = req.body
  try {
    const result = await pool.query(
      'UPDATE procedures SET name = $1 WHERE id = $2 RETURNING *',
      [name, id]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Procedure not found' })
    }
    res.json(result.rows[0])
  } catch (err) {
    console.error('Error updating procedure:', err)
    res.status(500).json({ error: 'Could not update procedure' })
  }
})

// ✅ Delete a procedure
router.delete('/:id', async (req, res) => {
  const { id } = req.params
  try {
    await pool.query('DELETE FROM procedures WHERE id = $1', [id])
    res.json({ success: true })
  } catch (err) {
    console.error('Error deleting procedure:', err)
    res.status(500).json({ error: 'Could not delete procedure' })
  }
})

export default router