import express from 'express'
import pool from '../db/index.js'
import { verifyToken } from '../auth/verifyToken.js'

const router = express.Router()

router.use(verifyToken)

// Create a new operatory
router.post('/', async (req, res) => {
  const { user_id, name } = req.body
  try {
    const result = await pool.query(
      'INSERT INTO ops (user_id, name) VALUES ($1, $2) RETURNING *',
      [user_id, name]
    )
    res.json(result.rows[0])
  } catch (err) {
    console.error('Error creating op:', err)
    res.status(500).json({ error: 'Could not create operatory' })
  }
})

// Get all ops for a user
router.get('/:user_id', async (req, res) => {
  const { user_id } = req.params
  try {
    const result = await pool.query(
      'SELECT * FROM ops WHERE user_id = $1 ORDER BY id',
      [user_id]
    )
    res.json(result.rows)
  } catch (err) {
    console.error('Error fetching ops:', err)
    res.status(500).json({ error: 'Could not fetch ops' })
  }
})

// ✅ Update an operatory
router.put('/:id', async (req, res) => {
  const { id } = req.params
  const { name } = req.body
  try {
    const result = await pool.query(
      'UPDATE ops SET name = $1 WHERE id = $2 RETURNING *',
      [name, id]
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Operatory not found' })
    res.json(result.rows[0])
  } catch (err) {
    console.error('Error updating operatory:', err)
    res.status(500).json({ error: 'Could not update operatory' })
  }
})

// ✅ Delete an operatory
router.delete('/:id', async (req, res) => {
  const { id } = req.params
  try {
    await pool.query('DELETE FROM ops WHERE id = $1', [id])
    res.json({ success: true })
  } catch (err) {
    console.error('Error deleting operatory:', err)

    // PostgreSQL foreign key constraint violations
    if (err.code === '23503') {
      if (err.constraint === 'op_supplies_op_id_fkey') {
        return res.status(400).json({
          error:
            'This operatory still has assigned supplies. Unassign all supplies first before deleting.',
        })
      }
      if (err.constraint === 'supply_logs_op_id_fkey') {
        return res.status(400).json({
          error:
            'This operatory has usage history in supply logs and cannot be deleted. Consider renaming.',
        })
      }
    }

    res.status(500).json({ error: 'Could not delete operatory' })
  }
})


export default router
