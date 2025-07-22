// 📁 routes/lowStockThresholdRoutes.js
import express from 'express'
import db from '../db/index.js'
import { verifyToken } from '../auth/verifyToken.js'

const router = express.Router()
router.use(verifyToken)

// ✅ PATCH: Update low stock threshold for specific location_inventory entry
router.patch('/:inventoryId/location/:locationId', async (req, res) => {
  const { inventoryId, locationId } = req.params
  const { low_stock_threshold } = req.body

  try {
    const result = await db.query(
      `UPDATE location_inventory
       SET low_stock_threshold = $1, updated_at = NOW()
       WHERE inventory_id = $2 AND location_id = $3
       RETURNING *`,
      [low_stock_threshold, inventoryId, locationId]
    )

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Location inventory entry not found' })
    }

    res.json(result.rows[0])
  } catch (err) {
    console.error('Error updating low stock threshold:', err)
    res.status(500).json({ error: 'Failed to update threshold' })
  }
})

// ✅ GET: All low stock thresholds for the current user
router.get('/all', async (req, res) => {
  const userId = req.user.id
  try {
    const result = await db.query(
      `SELECT 
         li.inventory_id,
         li.location_id,
         li.quantity,
         li.low_stock_threshold,
         inv.name,
         l.name AS location_name
       FROM location_inventory li
       JOIN inventory inv ON li.inventory_id = inv.id
       JOIN locations l ON li.location_id = l.id
       WHERE l.user_id = $1
       ORDER BY inv.name ASC`,
      [userId]
    )
    res.json(result.rows)
  } catch (err) {
    console.error('Error fetching all low stock thresholds:', err)
    res.status(500).json({ error: 'Failed to fetch thresholds' })
  }
})

// ✅ GET: All inventory items below threshold for the current user
router.get('/below-threshold', async (req, res) => {
  const userId = req.user.id
  try {
    const result = await db.query(
      `SELECT 
         li.inventory_id,
         li.location_id,
         li.quantity AS remaining,
         li.low_stock_threshold,
         inv.name,
         inv.unit,
         s.id AS supplier_id,
         s.name AS supplier_name,
         s.poc,
         s.email,
         s.phone,
         s.web_link,
         l.name AS location_name
       FROM location_inventory li
       JOIN inventory inv ON li.inventory_id = inv.id
       LEFT JOIN suppliers s ON inv.supplier_id = s.id
       JOIN locations l ON li.location_id = l.id
       WHERE l.user_id = $1 AND li.quantity <= li.low_stock_threshold
       ORDER BY inv.name ASC`,
      [userId]
      
    )

      console.log('📥 [API] Low stock fetch triggered by user:', userId)
  console.log('📦 [API] Raw low stock results:', result.rows)

    const formatted = result.rows.map(row => ({
      inventory_id: row.inventory_id,
      location_id: row.location_id,
      name: row.name,
      remaining: row.remaining,
      unit: row.unit,
      location_name: row.location_name,
      supplier_id: row.supplier_id,
      supplier: {
        name: row.supplier_name,
        poc: row.poc,
        email: row.email,
        phone: row.phone,
        website: row.web_link,
      },
    }))

    res.json(formatted)
  } catch (err) {
    console.error('Error fetching low stock items:', err)
    res.status(500).json({ error: 'Failed to fetch low stock items' })
  }
})

export default router