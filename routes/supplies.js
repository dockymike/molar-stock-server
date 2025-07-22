// ✅ src/routes/supplies.js
import express from 'express'
import pool from '../db/index.js'
import { verifyToken } from '../auth/verifyToken.js'

const router = express.Router()
router.use(verifyToken)

// ✅ Get all supplies for the logged-in user
router.get('/', async (req, res) => {
  const user_id = req.user.id

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

// ✅ Fetch supplies with inventory breakdown
router.get('/full', async (req, res) => {
  const user_id = req.user.id
  const { sortBy } = req.query

  let orderClause = 'ORDER BY s.name ASC'
  if (sortBy === 'available_asc') orderClause = 'ORDER BY inv.quantity ASC'
  if (sortBy === 'available_desc') orderClause = 'ORDER BY inv.quantity DESC'
  if (sortBy === 'name_desc') orderClause = 'ORDER BY s.name DESC'

  try {
    const result = await pool.query(
      `SELECT 
         s.*, 
         c.name AS category_name,
         sp.name AS supplier_name,
         COALESCE(SUM(inv.quantity), 0) AS total_inventory,
         json_agg(json_build_object(
           'inventory_id', inv.id,
           'location', inv.location,
           'quantity', inv.quantity
         )) FILTER (WHERE inv.id IS NOT NULL) AS inventory_entries
       FROM supplies s
       LEFT JOIN inventory_categories c ON s.category_id = c.id
       LEFT JOIN suppliers sp ON s.supplier_id = sp.id
       LEFT JOIN inventory inv ON s.id = inv.supply_id
       WHERE s.user_id = $1
       GROUP BY s.id, c.name, sp.name
       ${orderClause}`,
      [user_id]
    )

    res.json(result.rows)
  } catch (err) {
    console.error('Error fetching full supplies:', err)
    res.status(500).json({ error: 'Failed to fetch full supply list' })
  }
})

// ✅ Add a new supply
router.post('/', async (req, res) => {
  const user_id = req.user.id
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
      `INSERT INTO supplies
       (user_id, name, category_id, supplier_id, quantity, cost_per_unit, unit, low_stock_threshold, barcode)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [user_id, name, category_id, supplier_id, quantity, cost_per_unit, unit, low_stock_threshold, cleanedBarcode]
    )
    res.json(result.rows[0])
  } catch (err) {
    console.error('Error adding supply:', err)
    res.status(500).json({ error: 'Could not add supply' })
  }
})

// ✅ Update a supply
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

// ✅ Delete a supply (safe deletion)
router.delete('/:id', async (req, res) => {
  const { id } = req.params
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const invResult = await client.query(
      'SELECT COUNT(*) FROM inventory WHERE supply_id = $1',
      [id]
    )
    const invCount = parseInt(invResult.rows[0].count, 10)
    if (invCount > 0) {
      await client.query('ROLLBACK')
      return res.status(400).json({
        error: 'This supply is still present in inventory. Please remove it from inventory first.',
      })
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
