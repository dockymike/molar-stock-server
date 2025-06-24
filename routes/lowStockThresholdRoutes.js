// 📁 routes/lowStockThresholdRoutes.js
import express from 'express'
import pool from '../db/index.js'
import { verifyToken } from '../auth/verifyToken.js'

const router = express.Router()
router.use(verifyToken)

// ✅ Update low stock threshold for global supply
router.patch('/global/:supplyId', async (req, res) => {
  const { supplyId } = req.params
  const { low_stock_threshold } = req.body
  try {
    const result = await pool.query(
      'UPDATE supplies SET low_stock_threshold = $1 WHERE id = $2 RETURNING *',
      [low_stock_threshold, supplyId]
    )
    res.json(result.rows[0])
  } catch (err) {
    console.error('❌ Error updating global low stock threshold:', err)
    res.status(500).json({ error: 'Failed to update threshold' })
  }
})

// ✅ Update low stock threshold for operatory supply
router.patch('/operatory/:opSupplyId', async (req, res) => {
  const { opSupplyId } = req.params
  const { low_stock_threshold } = req.body

  console.log('🔧 Updating low stock threshold for op supply')
  console.log('➡️ opSupplyId:', opSupplyId)
  console.log('➡️ New threshold:', low_stock_threshold)

  try {
    const result = await pool.query(
      'UPDATE op_supplies SET low_stock_threshold = $1 WHERE id = $2 RETURNING *',
      [low_stock_threshold, opSupplyId]
    )

    if (result.rowCount === 0) {
      console.warn('⚠️ No op_supply found with that ID')
      return res.status(404).json({ error: 'Operatory supply not found' })
    }

    console.log('✅ Threshold updated for opSupplyId:', opSupplyId)
    res.json(result.rows[0])
  } catch (err) {
    console.error('❌ Error updating operatory low stock threshold:', err)
    res.status(500).json({ error: 'Failed to update threshold' })
  }
})

// 🔄 Get all low stock thresholds for the user
router.get('/all', async (req, res) => {
  const userId = req.user.id
  try {
    const [supplies, opSupplies] = await Promise.all([
      pool.query('SELECT id, name, low_stock_threshold FROM supplies WHERE user_id = $1', [userId]),
      pool.query(`
        SELECT os.id, os.op_id, os.supply_id, os.low_stock_threshold, o.name as op_name
        FROM op_supplies os
        JOIN ops o ON os.op_id = o.id
        WHERE o.user_id = $1
      `, [userId]),
    ])
    res.json({ global: supplies.rows, operatories: opSupplies.rows })
  } catch (err) {
    console.error('❌ Error fetching all low stock thresholds:', err)
    res.status(500).json({ error: 'Failed to fetch thresholds' })
  }
})

// ✅ Get supplies BELOW their threshold for global and operatory
router.get('/:user_id', async (req, res) => {
  const { user_id } = req.params
  try {
    // Global supplies below threshold WITH supplier info
    const globalLow = await pool.query(
      `SELECT 
         s.id,
         s.name,
         s.quantity,
         s.unit,
         s.low_stock_threshold,
         s.supplier_id,
         sup.name AS supplier_name,
         sup.poc,
         sup.email,
         sup.phone,
         sup.web_link
       FROM supplies s
       LEFT JOIN suppliers sup ON s.supplier_id = sup.id
       WHERE s.user_id = $1 AND s.quantity <= s.low_stock_threshold`,
      [user_id]
    )

    // Operatory supplies below threshold
    const opLow = await pool.query(
      `SELECT 
         os.id,
         os.quantity,
         os.low_stock_threshold,
         s.name,
         s.unit,
         o.name AS op_name,
         s.supplier_id,
         sup.name AS supplier_name,
         sup.poc,
         sup.email,
         sup.phone,
         sup.web_link
       FROM op_supplies os
       JOIN supplies s ON os.supply_id = s.id
       JOIN ops o ON os.op_id = o.id
       LEFT JOIN suppliers sup ON s.supplier_id = sup.id
       WHERE s.user_id = $1 AND os.quantity <= os.low_stock_threshold`,
      [user_id]
    )

    const response = [
      ...globalLow.rows.map((row) => ({
        id: row.id,
        name: row.name,
        remaining: row.quantity,
        unit: row.unit,
        type: 'global',
        supplier_id: row.supplier_id,
        supplier: {
          name: row.supplier_name,
          poc: row.poc,
          email: row.email,
          phone: row.phone,
          website: row.web_link,
        },
      })),
      ...opLow.rows.map((row) => ({
        id: row.id,
        name: row.name,
        remaining: row.quantity,
        unit: row.unit,
        op_name: row.op_name,
        type: 'operatory',
        supplier_id: row.supplier_id,
        supplier: {
          name: row.supplier_name,
          poc: row.poc,
          email: row.email,
          phone: row.phone,
          website: row.web_link,
        },
      })),
    ]

    res.json(response)
  } catch (err) {
    console.error('❌ Error fetching low stock items:', err)
    res.status(500).json({ error: 'Failed to fetch low stock items' })
  }
})

export default router
