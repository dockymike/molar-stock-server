import express from 'express'
import pool from '../db/index.js'
import { verifyToken } from '../auth/verifyToken.js'

const router = express.Router()
router.use(verifyToken)

// ✅ Log supply usage or restocking
router.post('/', async (req, res) => {
  const { user_id, op_id, supply_id, quantity, action, procedure_id } = req.body

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // 1. ✅ Get cost per unit from global supplies
    const { rows: supplyRows } = await client.query(
      'SELECT cost_per_unit FROM supplies WHERE id = $1',
      [supply_id]
    )

    if (supplyRows.length === 0) {
      throw new Error('Supply not found')
    }

    const unitCost = parseFloat(supplyRows[0].cost_per_unit || 0)
    const totalCost = unitCost * quantity

    // 2. ✅ Update per-operatory inventory
    const opUpdate = await client.query(
      `UPDATE op_supplies
       SET quantity = quantity ${action === 'use' ? '-' : '+'} $1
       WHERE op_id = $2 AND supply_id = $3
       RETURNING *`,
      [quantity, op_id, supply_id]
    )

    // 3. ✅ Update global inventory (quantity on hand)
    const globalUpdateQuery = `
      UPDATE supplies
      SET quantity = quantity ${action === 'use' ? '-' : '+'} $1
      WHERE id = $2
      RETURNING id, name, quantity, cost_per_unit, category_id, supplier_id, user_id
    `
    const globalUpdate = await client.query(globalUpdateQuery, [quantity, supply_id])

    // 4. ✅ Log the action in supply_logs (with optional procedure_id)
    const logInsert = await client.query(
      `INSERT INTO supply_logs 
        (user_id, op_id, supply_id, quantity, action, unit_cost, total_cost, procedure_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [user_id, op_id, supply_id, quantity, action, unitCost, totalCost, procedure_id || null]
    )

    await client.query('COMMIT')
    res.json(logInsert.rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Error logging supply usage:', err)
    res.status(500).json({ error: 'Failed to log supply usage' })
  } finally {
    client.release()
  }
})

// ✅ Fetch logs for a user (with joined supply, op, and procedure names)
// ✅ Fetch logs for a user (with joined supply, op, and procedure names)
router.get('/:user_id', async (req, res) => {
  const { user_id } = req.params
  try {
    const result = await pool.query(
      `SELECT 
         l.id,
         l.quantity,
         l.action,
         l.unit_cost,
         l.total_cost,
         l.created_at,
         s.name AS supply_name, 
         o.name AS op_name,
         p.name AS procedure_name
       FROM supply_logs l
       LEFT JOIN supplies s ON l.supply_id = s.id
       LEFT JOIN ops o ON l.op_id = o.id
       LEFT JOIN procedures p ON l.procedure_id = p.id
       WHERE l.user_id = $1
       ORDER BY l.created_at DESC`,
      [user_id]
    )
    res.json(result.rows)
  } catch (err) {
    console.error('Failed to fetch logs:', err)
    res.status(500).json({ error: 'Failed to fetch logs' })
  }
})


export default router
