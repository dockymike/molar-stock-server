import express from 'express'
import pool from '../db/index.js'
import { verifyToken } from '../auth/verifyToken.js'

const router = express.Router()
router.use(verifyToken)

// ✅ Assigned quantity breakdown for a supply (with op ID and op_supply ID)
router.get('/assigned-details/:supply_id', async (req, res) => {
  const { supply_id } = req.params
  console.log('🛬 Incoming request for assigned-details of supply', supply_id)

  try {
    const result = await pool.query(
      `SELECT 
         os.id AS op_supply_id,
         os.op_id,
         o.name AS op_name,
         os.quantity
       FROM op_supplies os
       JOIN ops o ON os.op_id = o.id
       WHERE os.supply_id = $1
       ORDER BY o.name`,
      [supply_id]
    )
    res.json(result.rows)
  } catch (err) {
    console.error('Error fetching assigned breakdown:', err)
    res.status(500).json({ error: 'Could not fetch assigned breakdown' })
  }
})

// ✅ Add a new supply (now includes unit and low_stock_threshold)
router.post('/', async (req, res) => {
  const {
    user_id,
    name,
    category_id,
    supplier_id,
    quantity,
    cost_per_unit,
    unit,
    low_stock_threshold, // ✅ added
  } = req.body

  try {
    const result = await pool.query(
      `INSERT INTO supplies
       (user_id, name, category_id, supplier_id, quantity, cost_per_unit, unit, low_stock_threshold)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [user_id, name, category_id, supplier_id, quantity, cost_per_unit, unit, low_stock_threshold]
    )
    res.json(result.rows[0])
  } catch (err) {
    console.error('Error adding supply:', err)
    res.status(500).json({ error: 'Could not add supply' })
  }
})

// ✅ Get all supplies for a user
router.get('/:user_id', async (req, res) => {
  const { user_id } = req.params

  try {
    const result = await pool.query(
      `SELECT s.*, c.name AS category_name, sup.name AS supplier_name
       FROM supplies s
       LEFT JOIN inventory_categories c ON s.category_id = c.id
       LEFT JOIN suppliers sup ON s.supplier_id = sup.id
       WHERE s.user_id = $1
       ORDER BY s.id`,
      [user_id]
    )

    res.json(result.rows)
  } catch (err) {
    console.error('Error fetching supplies:', err)
    res.status(500).json({ error: 'Could not fetch supplies' })
  }
})

// ✅ Edit a supply (now includes unit and low_stock_threshold)
router.put('/:id', async (req, res) => {
  const { id } = req.params
  const {
    name,
    category_id,
    supplier_id,
    quantity,
    cost_per_unit,
    unit,
    low_stock_threshold,
    barcode,
  } = req.body

  const cleanedBarcode = barcode?.trim() === '' ? null : barcode

  try {
    const result = await pool.query(
      `UPDATE supplies
       SET name = $1,
           category_id = $2,
           supplier_id = $3,
           quantity = $4,
           cost_per_unit = $5,
           unit = $6,
           low_stock_threshold = $7,
           barcode = $8
       WHERE id = $9
       RETURNING *`,
      [name, category_id, supplier_id, quantity, cost_per_unit, unit, low_stock_threshold, cleanedBarcode, id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Supply not found' })
    }

    res.json(result.rows[0])
  } catch (err) {
    console.error('Error updating supply:', err)
    res.status(500).json({ error: 'Could not update supply' })
  }
})


// ✅ Delete a supply (only if not assigned to any operatory)
router.delete('/:id', async (req, res) => {
  const { id } = req.params
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    // 🔍 Check if supply is still assigned to any operatories
    const result = await client.query(
      'SELECT COUNT(*) FROM op_supplies WHERE supply_id = $1',
      [id]
    )

    const count = parseInt(result.rows[0].count, 10)

    if (count > 0) {
      await client.query('ROLLBACK')
      return res
        .status(400)
        .json({ error: 'This supply is still assigned to one or more operatories. Remove the supply from all operatories first.' })
    }

    await client.query('DELETE FROM supplies WHERE id = $1', [id])
    await client.query('COMMIT')
    res.json({ success: true })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Error deleting supply:', err)
    res.status(500).json({ error: 'Could not delete supply' })
  } finally {
    client.release()
  }
})

export default router
