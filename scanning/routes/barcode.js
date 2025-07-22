// 📁 routes/barcode.js
import express from 'express'
import pool from '../../db/index.js'
import { verifyToken } from '../../auth/verifyToken.js'

const router = express.Router()
router.use(verifyToken)

//
// 🔍 Barcode Lookup
//
router.get('/lookup/:barcode', verifyToken, async (req, res) => {
  const { barcode } = req.params
  const userId = req.user?.id

  try {
    const result = await pool.query(
      'SELECT * FROM inventory WHERE barcode = $1 AND user_id = $2',
      [barcode, userId]
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

//
// 🔗 Assign barcode to existing inventory item
//
router.post('/assign', async (req, res) => {
  const { inventory_id, barcode } = req.body
  try {
    const result = await pool.query(
      'UPDATE inventory SET barcode = $1 WHERE id = $2 RETURNING *',
      [barcode, inventory_id]
    )
    res.json(result.rows[0])
  } catch (err) {
    console.error('Error assigning barcode:', err)
    res.status(500).json({ error: 'Database error' })
  }
})

//
// ➕ Create new inventory item with barcode
//
router.post('/create', async (req, res) => {
  const {
    user_id,
    name,
    category_id,
    supplier_id,
    quantity,
    cost_per_unit,
    unit,
    barcode,
    location_id,
  } = req.body

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const invResult = await client.query(
      `INSERT INTO inventory (user_id, name, category_id, supplier_id, cost_per_unit, unit, barcode)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [user_id, name, category_id, supplier_id, cost_per_unit, unit, barcode]
    )

    const inventory_id = invResult.rows[0].id

    await client.query(
      `INSERT INTO location_inventory (inventory_id, location_id, quantity, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())`,
      [inventory_id, location_id, quantity]
    )

    await client.query('COMMIT')
    res.json({ id: inventory_id, name })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Error creating inventory with barcode:', err)
    res.status(500).json({ error: 'Database error' })
  } finally {
    client.release()
  }
})

//
// 📥 Scan Check-In (adds to location_inventory)
//
router.post('/checkin', async (req, res) => {
  const { inventory_id, quantity, location_id } = req.body
  const client = await pool.connect()

  try {
    const qty = parseInt(quantity, 10)
    if (isNaN(qty)) return res.status(400).json({ error: 'Invalid quantity' })

    await client.query('BEGIN')

    const result = await client.query(
      'SELECT quantity FROM location_inventory WHERE inventory_id = $1 AND location_id = $2 FOR UPDATE',
      [inventory_id, location_id]
    )

    const currentQty = result.rows[0]?.quantity ?? 0
    const newQty = currentQty + qty

    if (newQty < 0) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Insufficient quantity at location' })
    }

    if (result.rowCount > 0) {
      await client.query(
        'UPDATE location_inventory SET quantity = $1, updated_at = NOW() WHERE inventory_id = $2 AND location_id = $3',
        [newQty, inventory_id, location_id]
      )
    } else {
      if (qty < 0) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'Cannot subtract from non-existent inventory at location' })
      }
      await client.query(
        `INSERT INTO location_inventory (inventory_id, location_id, quantity, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())`,
        [inventory_id, location_id, qty]
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

// 📤 Scan Consume (subtracts from location_inventory)
router.post('/consume', verifyToken, async (req, res) => {
  const { inventory_id, quantity, location_id } = req.body
  const client = await pool.connect()

  try {
    const qty = parseInt(quantity, 10)
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Invalid quantity' })
    }

    await client.query('BEGIN')

    // 🔐 Optional: Ensure inventory belongs to this user
    const userId = req.user?.id
    const invCheck = await client.query(
      'SELECT user_id FROM inventory WHERE id = $1',
      [inventory_id]
    )

    if (invCheck.rows.length === 0 || invCheck.rows[0].user_id !== userId) {
      await client.query('ROLLBACK')
      return res.status(403).json({ error: 'Unauthorized: Inventory does not belong to this user.' })
    }

    const result = await client.query(
      'SELECT quantity FROM location_inventory WHERE inventory_id = $1 AND location_id = $2 FOR UPDATE',
      [inventory_id, location_id]
    )

    if (result.rowCount === 0) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Inventory not found at this location' })
    }

    const currentQty = result.rows[0].quantity
    if (currentQty < qty) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Insufficient quantity at location' })
    }

    await client.query(
      'UPDATE location_inventory SET quantity = quantity - $1, updated_at = NOW() WHERE inventory_id = $2 AND location_id = $3',
      [qty, inventory_id, location_id]
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
