import express from 'express'
import pool from '../db/index.js'
import { verifyToken } from '../auth/verifyToken.js'

const router = express.Router()

// 🔐 Protect all routes
router.use(verifyToken)

// ✅ Assign a supply to a procedure
router.post('/', async (req, res) => {
  const { procedure_id, supply_id, quantity } = req.body
  try {
    const result = await pool.query(
      `INSERT INTO procedure_supplies (procedure_id, supply_id, quantity)
       VALUES ($1, $2, $3) RETURNING *`,
      [procedure_id, supply_id, quantity]
    )
    res.json(result.rows[0])
  } catch (err) {
    console.error('Error assigning supply to procedure:', err)
    res.status(500).json({ error: 'Could not assign supply' })
  }
})

// ✅ Get supplies for a procedure (now includes unit!)
router.get('/:procedure_id', async (req, res) => {
  const { procedure_id } = req.params
  try {
    const result = await pool.query(
      `SELECT 
         ps.id,
         ps.procedure_id,
         ps.supply_id,
         ps.quantity AS procedure_quantity,
         s.name AS supply_name,
         s.quantity AS supply_quantity,
         s.cost_per_unit,
         COALESCE(s.unit, 'piece(s)') AS unit
       FROM procedure_supplies ps
       JOIN supplies s ON ps.supply_id = s.id
       WHERE ps.procedure_id = $1
       ORDER BY ps.id`,
      [procedure_id]
    )
    res.json(result.rows)
  } catch (err) {
    console.error('Error fetching procedure supplies:', err)
    res.status(500).json({ error: 'Could not fetch supplies for procedure' })
  }
})

// ✅ Update quantity for a procedure supply row
router.put('/:id', async (req, res) => {
  const { id } = req.params
  const { quantity } = req.body
  try {
    const result = await pool.query(
      `UPDATE procedure_supplies SET quantity = $1 WHERE id = $2 RETURNING *`,
      [quantity, id]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Supply not found' })
    }
    res.json(result.rows[0])
  } catch (err) {
    console.error('Error updating procedure supply quantity:', err)
    res.status(500).json({ error: 'Could not update quantity' })
  }
})

// ✅ Delete a supply from a procedure
router.delete('/:id', async (req, res) => {
  const { id } = req.params
  try {
    await pool.query('DELETE FROM procedure_supplies WHERE id = $1', [id])
    res.json({ success: true })
  } catch (err) {
    console.error('Error deleting supply from procedure:', err)
    res.status(500).json({ error: 'Could not delete supply' })
  }
})

export default router
