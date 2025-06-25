// 📁 routes/barcode.js
import express from 'express'
import pool from '../../db/index.js'
import { verifyToken } from '../../auth/verifyToken.js'

const router = express.Router()
router.use(verifyToken)

// 🔍 Lookup supply by barcode
router.get('/:barcode', async (req, res) => {
  const { barcode } = req.params
  try {
    const result = await pool.query(
      'SELECT * FROM supplies WHERE barcode = $1',
      [barcode]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Barcode not found' })
    }
    res.json(result.rows[0])
  } catch (err) {
    console.error('Error looking up barcode:', err)
    res.status(500).json({ error: 'Database error' })
  }
})

// 🔗 Assign barcode to existing supply
router.post('/assign', async (req, res) => {
  const { supply_id, barcode } = req.body
  try {
    const result = await pool.query(
      'UPDATE supplies SET barcode = $1 WHERE id = $2 RETURNING *',
      [barcode, supply_id]
    )
    res.json(result.rows[0])
  } catch (err) {
    console.error('Error assigning barcode:', err)
    res.status(500).json({ error: 'Database error' })
  }
})

// ➕ Create new supply with barcode
router.post('/create', async (req, res) => {
  const { user_id, name, category_id, supplier_id, quantity, cost_per_unit, unit, low_stock_threshold, barcode } = req.body
  try {
    const result = await pool.query(
      `INSERT INTO supplies (user_id, name, category_id, supplier_id, quantity, cost_per_unit, unit, low_stock_threshold, barcode)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [user_id, name, category_id, supplier_id, quantity, cost_per_unit, unit, low_stock_threshold, barcode]
    )
    res.json(result.rows[0])
  } catch (err) {
    console.error('Error creating supply with barcode:', err)
    res.status(500).json({ error: 'Database error' })
  }
})

// 📥 Scan Check-In (adds quantity safely, prevents negatives)
router.post('/checkin', async (req, res) => {
  const { supply_id, quantity, op_id } = req.body
  const client = await pool.connect()

  try {
    const qty = parseInt(quantity, 10)
    if (isNaN(qty)) return res.status(400).json({ error: 'Invalid quantity' })

    await client.query('BEGIN')

    if (op_id) {
      const result = await client.query(
        'SELECT quantity FROM op_supplies WHERE op_id = $1 AND supply_id = $2 FOR UPDATE',
        [op_id, supply_id]
      )

      const currentQty = result.rows[0]?.quantity ?? 0
      const newQty = currentQty + qty

      if (newQty < 0) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'Insufficient quantity in operatory' })
      }

      if (result.rowCount > 0) {
        await client.query(
          'UPDATE op_supplies SET quantity = $1 WHERE op_id = $2 AND supply_id = $3',
          [newQty, op_id, supply_id]
        )
      } else {
        if (qty < 0) {
          await client.query('ROLLBACK')
          return res.status(400).json({ error: 'Cannot subtract from non-existent operatory supply' })
        }

        await client.query(
          'INSERT INTO op_supplies (op_id, supply_id, quantity) VALUES ($1, $2, $3)',
          [op_id, supply_id, qty]
        )
      }
    } else {
      const result = await client.query(
        'SELECT quantity FROM supplies WHERE id = $1 FOR UPDATE',
        [supply_id]
      )

      if (result.rowCount === 0) {
        await client.query('ROLLBACK')
        return res.status(404).json({ error: 'Supply not found' })
      }

      const currentQty = result.rows[0].quantity
      const newQty = currentQty + qty

      if (newQty < 0) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'Insufficient unassigned inventory' })
      }

      await client.query(
        'UPDATE supplies SET quantity = $1 WHERE id = $2',
        [newQty, supply_id]
      )
    }

    await client.query('COMMIT')
    res.json({ success: true })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Error in scan check-in:', err)
    res.status(500).json({ error: 'Check-in failed' })
  } finally {
    client.release()
  }
})




// 📤 Scan Consume (subtracts quantity)
router.post('/consume', async (req, res) => {
  const { supply_id, quantity, op_id } = req.body
  const client = await pool.connect()

  try {
    if (!op_id) return res.status(400).json({ error: 'Operatory ID required' })

    const qty = parseInt(quantity, 10)
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Invalid quantity' })
    }

    await client.query('BEGIN')

    const result = await client.query(
      'SELECT quantity FROM op_supplies WHERE op_id = $1 AND supply_id = $2 FOR UPDATE',
      [op_id, supply_id]
    )

    if (result.rowCount === 0) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Supply not found in this operatory' })
    }

    const currentQty = result.rows[0].quantity
    if (currentQty < qty) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Insufficient quantity in operatory' })
    }

    await client.query(
      'UPDATE op_supplies SET quantity = quantity - $1 WHERE op_id = $2 AND supply_id = $3',
      [qty, op_id, supply_id]
    )

    await client.query('COMMIT')
    res.json({ success: true })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Error in scan consume:', err)
    res.status(500).json({ error: 'Consume failed' })
  } finally {
    client.release()
  }
})


export default router
