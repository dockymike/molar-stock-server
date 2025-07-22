import express from 'express'
import pool from '../db/index.js'
import { verifyToken } from '../auth/verifyToken.js'

const router = express.Router()

// 🔐 Protect all routes
router.use(verifyToken)

/**
 * POST /api/op-supplies
 * Assign a supply to an operatory. Deducts from unassigned `supplies.quantity`.
 */
router.post('/', async (req, res) => {
  const { op_id, supply_id, quantity } = req.body
  const client = await pool.connect()

  try {
    const qty = parseInt(quantity, 10)
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Quantity must be greater than zero' })
    }

    await client.query('BEGIN')

    // ✅ Get unassigned quantity from supplies
    const supplyRes = await client.query(
      'SELECT quantity FROM supplies WHERE id = $1 FOR UPDATE',
      [supply_id]
    )
    if (supplyRes.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Supply not found' })
    }

    const unassigned = parseInt(supplyRes.rows[0].quantity, 10)
    if (qty > unassigned) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: `Not enough unassigned inventory. Only ${unassigned} available.` })
    }

    // ✅ Deduct from global unassigned
    await client.query(
      'UPDATE supplies SET quantity = quantity - $1 WHERE id = $2',
      [qty, supply_id]
    )

    // ✅ Insert or update op_supplies
    const existing = await client.query(
      'SELECT * FROM op_supplies WHERE op_id = $1 AND supply_id = $2',
      [op_id, supply_id]
    )

    let opSupply
    if (existing.rows.length > 0) {
      const updated = await client.query(
        'UPDATE op_supplies SET quantity = quantity + $1 WHERE op_id = $2 AND supply_id = $3 RETURNING *',
        [qty, op_id, supply_id]
      )
      opSupply = updated.rows[0]
    } else {
      const inserted = await client.query(
        'INSERT INTO op_supplies (op_id, supply_id, quantity) VALUES ($1, $2, $3) RETURNING *',
        [op_id, supply_id, qty]
      )
      opSupply = inserted.rows[0]
    }

    await client.query('COMMIT')
    res.json(opSupply)
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Error assigning supply to op:', err)
    res.status(500).json({ error: 'Could not assign supply to operatory' })
  } finally {
    client.release()
  }
})


// ✅ GET /api/op-supplies/assigned/:supply_id?total=true
router.get('/assigned/:supply_id', async (req, res) => {
  const { supply_id } = req.params
  const returnTotal = req.query.total === 'true'

  try {
    const result = await pool.query(
      `SELECT 
         os.id AS op_supply_id,
         os.op_id,
         o.name AS op_name,
         os.quantity
       FROM op_supplies os
       JOIN ops o ON os.op_id = o.id
       WHERE os.supply_id = $1`,
      [supply_id]
    )

    if (returnTotal) {
      const total = result.rows.reduce((sum, row) => sum + parseInt(row.quantity || 0, 10), 0)
      return res.json({ assigned: total })
    }

    res.json(result.rows)
  } catch (err) {
    console.error('Error fetching assigned breakdown:', err)
    res.status(500).json({ error: 'Could not fetch assigned breakdown' })
  }
})

/**
 * PATCH /api/op-supplies/:id
 * Update quantity of a specific op_supply row.
 */
router.patch('/:id', async (req, res) => {
  const { id } = req.params
  const { quantity } = req.body
  try {
    const result = await pool.query(
      'UPDATE op_supplies SET quantity = $1 WHERE id = $2 RETURNING *',
      [quantity, id]
    )
    res.json(result.rows[0])
  } catch (err) {
    console.error('Error updating op_supply quantity:', err)
    res.status(500).json({ error: 'Could not update supply quantity' })
  }
})

/**
 * DELETE /api/op-supplies/:id
 * Delete a supply assignment from an operatory.
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const fetch = await client.query(
      'SELECT supply_id, quantity FROM op_supplies WHERE id = $1',
      [id]
    )
    if (fetch.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Op supply not found' })
    }

    await client.query('DELETE FROM op_supplies WHERE id = $1', [id])
    await client.query('COMMIT')
    res.json({ success: true })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Error deleting op_supply:', err)
    res.status(500).json({ error: 'Could not delete supply' })
  } finally {
    client.release()
  }
})

/**
 * GET /api/op-supplies/:op_id
 * Get all supplies assigned to a specific operatory.
 */
router.get('/:op_id', async (req, res) => {
  const { op_id } = req.params
  try {
    const result = await pool.query(
      `SELECT 
         os.id,
         os.quantity,
         os.low_stock_threshold, -- ✅ ADDED
         s.name AS supply_name,
         s.unit,
         s.quantity AS global_quantity,
         s.id AS supply_id
       FROM op_supplies os
       JOIN supplies s ON os.supply_id = s.id
       WHERE os.op_id = $1`,
      [op_id]
    )

    res.json(result.rows)
  } catch (err) {
    console.error('Error fetching supplies for operatory:', err)
    res.status(500).json({ error: 'Could not fetch op supplies' })
  }
})

export default router

