// ✅ backend/routes/inventory.js
import express from 'express'
import pool from '../db/index.js'
import { verifyToken } from '../auth/verifyToken.js'

const router = express.Router()

// ✅ backend/routes/inventory.js fetching inventory options (user-specific)
router.get('/options', verifyToken, async (req, res) => {
  const userId = req.user?.id
  try {
    const result = await pool.query(`
      SELECT 
        id AS inventory_id,
        name,
        barcode,
        unit,
        cost_per_unit,
        category_id,
        supplier_id
      FROM inventory
      WHERE user_id = $1
      ORDER BY name ASC
    `, [userId])
    
    res.json(result.rows)
  } catch (err) {
    console.error('Failed to fetch inventory options:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})


// ✅ Get all inventory data, including optional filters
router.get('/', verifyToken, async (req, res) => {
  const userId = req.user?.id
  const { search = '', category = '', locations = '' } = req.query

  try {
    // Optimized query with better join order and explicit WHERE clauses
    let baseQuery = `
      SELECT 
        inv.id AS inventory_id,
        inv.name,
        inv.barcode,
        inv.unit,
        inv.cost_per_unit,
        inv.category_id,
        inv.supplier_id,
        c.name AS category_name,
        s.name AS supplier_name,
        li.location_id,
        l.name AS location_name,
        li.quantity,
        li.low_stock_threshold AS location_low_stock_threshold,
        li.updated_at AS location_updated_at
      FROM inventory inv
      LEFT JOIN location_inventory li ON inv.id = li.inventory_id
      LEFT JOIN locations l ON li.location_id = l.id AND l.user_id = $1
      LEFT JOIN inventory_categories c ON inv.category_id = c.id AND c.user_id = $1
      LEFT JOIN suppliers s ON inv.supplier_id = s.id AND s.user_id = $1
      WHERE inv.user_id = $1
    `

    const conditions = []
    const values = [userId]

    // 🔍 Search by name or barcode
    if (search) {
      values.push(`%${search}%`)
      values.push(`%${search}%`)
      conditions.push(`(inv.name ILIKE $${values.length - 1} OR inv.barcode ILIKE $${values.length})`)
    }

    // 📦 Filter by category
    if (category) {
      values.push(category)
      conditions.push(`c.name = $${values.length}`)
    }

    // 📍 Filter by multiple location names
    if (locations) {
      const locationList = locations.split(',').map((loc) => loc.trim())
      const placeholders = locationList.map((_, i) => `$${values.length + i + 1}`)
      values.push(...locationList)
      conditions.push(`l.name = ANY(ARRAY[${placeholders.join(',')}])`)
    }

    if (conditions.length > 0) {
      baseQuery += ' AND ' + conditions.join(' AND ')
    }

    baseQuery += ' ORDER BY inv.name ASC, li.updated_at DESC'

    const result = await pool.query(baseQuery, values)

    res.json(result.rows)
  } catch (err) {
    console.error('Failed to fetch inventory with filters:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})



// ✅ Add new inventory entries with user scoping
router.post('/add', verifyToken, async (req, res) => {
  const client = await pool.connect()
  try {
    const { destination, location, supplies } = req.body
    const userId = req.user?.id

    console.log('📥 Incoming /api/inventory/add request:')
console.log('👤 User ID:', userId)
console.log('📦 Supplies:', supplies)
console.log('📍 Destination:', destination)
console.log('➡️ Location ID:', location)



    await client.query('BEGIN')

    const { rows } = await client.query(
      'SELECT id FROM locations WHERE name = $1 AND user_id = $2',
      ['Common Area', userId]
    )
    const commonAreaId = rows[0]?.id
    if (!commonAreaId) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Common Area not found for this user.' })
    }

    for (const item of supplies) {
      let inventoryId
      let targetLocationId = destination === 'common_area' ? commonAreaId : location

      if (item.isNew) {
        const { name, quantity, barcode, category_id, supplier_id, unit, cost_per_unit } = item
        if (!name || quantity <= 0) continue

        // 🔐 Match only inventory owned by this user
        const { rows: invRows } = await client.query(
          'SELECT id FROM inventory WHERE name ILIKE $1 AND user_id = $2',
          [name, userId]
        )

        if (invRows.length > 0) {
          inventoryId = invRows[0].id
        } else {
          // Check if barcode already exists
          if (barcode) {
            const { rows: existingBarcode } = await client.query(
              'SELECT id, name FROM inventory WHERE barcode = $1 AND user_id = $2',
              [barcode, userId]
            )
            
            if (existingBarcode.length > 0) {
              await client.query('ROLLBACK')
              return res.status(400).json({ 
                error: `Barcode "${barcode}" is already used by item "${existingBarcode[0].name}"` 
              })
            }
          }
          
          console.log(`📝 Writing inventory_id=${inventoryId} to location_id=${targetLocationId} (qty=${item.quantity})`)

          const insert = await client.query(
            'INSERT INTO inventory (name, barcode, unit, cost_per_unit, category_id, supplier_id, user_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW()) RETURNING id',
            [name, barcode || null, unit || null, cost_per_unit || null, category_id || null, supplier_id || null, userId]
          )
          inventoryId = insert.rows[0].id
        }
      } else {
        inventoryId = item.inventory_id
        if (!inventoryId || item.quantity <= 0) continue

        // 🔐 Optional safety: confirm this inventory belongs to user
        const { rowCount } = await client.query(
          'SELECT 1 FROM inventory WHERE id = $1 AND user_id = $2',
          [inventoryId, userId]
        )
        if (rowCount === 0) {
          await client.query('ROLLBACK')
          return res.status(403).json({ error: 'Inventory does not belong to current user.' })
        }
      }

      if (destination === 'transfer') {
        const { rows: fromRows } = await client.query(
          'SELECT id, quantity FROM location_inventory WHERE inventory_id = $1 AND location_id = $2',
          [inventoryId, commonAreaId]
        )
        if (!fromRows.length || fromRows[0].quantity < item.quantity) {
          await client.query('ROLLBACK')
          return res.status(400).json({ error: `Not enough "${item.name || inventoryId}" in Common Area to transfer.` })
        }

        await client.query(
          'UPDATE location_inventory SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2',
          [item.quantity, fromRows[0].id]
        )
        targetLocationId = location
      }

      if (!targetLocationId) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: `No valid location selected for "${item.name || inventoryId}".` })
      }

      const { rows: locRows } = await client.query(
        'SELECT id FROM location_inventory WHERE inventory_id = $1 AND location_id = $2',
        [inventoryId, targetLocationId]
      )

      if (locRows.length > 0) {
        await client.query(
          'UPDATE location_inventory SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2',
          [item.quantity, locRows[0].id]
        )
      } else {
        await client.query(
          'INSERT INTO location_inventory (inventory_id, location_id, quantity, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW())',
          [inventoryId, targetLocationId, item.quantity]
        )
      }

    }

    await client.query('COMMIT')
    res.json({ message: 'Inventory added successfully!' })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Error adding inventory:', err)
    
    // Handle unique constraint violation
    if (err.code === '23505' && (err.constraint === 'inventory_barcode_key' || err.constraint === 'inventory_user_barcode_unique')) {
      return res.status(400).json({ 
        error: `This barcode is already used by another item in your inventory.` 
      })
    }
    
    res.status(500).json({ error: 'Server error while adding inventory' })
  } finally {
    client.release()
  }
})



// ✅ Update inventory and location-specific data scoped to user
router.put('/:id', verifyToken, async (req, res) => {
  const { id } = req.params
  const {
    name,
    barcode,
    unit,
    cost_per_unit,
    category_id,
    supplier_id,
    location_id,
    quantity,
    low_stock_threshold,
  } = req.body

  const userId = req.user?.id
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    // 🔐 Ensure inventory item belongs to current user
    const { rowCount: inventoryExists } = await client.query(
      'SELECT 1 FROM inventory WHERE id = $1 AND user_id = $2',
      [id, userId]
    )

    if (!inventoryExists) {
      await client.query('ROLLBACK')
      return res.status(403).json({ error: 'You do not have access to this inventory item' })
    }

    // Check if barcode already exists for another item (but allow same barcode for current item)
    if (barcode) {
      const { rows: existingBarcode } = await client.query(
        'SELECT id, name FROM inventory WHERE barcode = $1 AND id != $2 AND user_id = $3',
        [barcode, id, userId]
      )
      
      if (existingBarcode.length > 0) {
        await client.query('ROLLBACK')
        return res.status(400).json({ 
          error: `Barcode "${barcode}" is already used by item "${existingBarcode[0].name}"` 
        })
      }
    }

    await client.query(
      'UPDATE inventory SET name = $1, barcode = $2, unit = $3, cost_per_unit = $4, category_id = $5, supplier_id = $6, updated_at = NOW() WHERE id = $7',
      [name, barcode, unit, cost_per_unit, category_id, supplier_id, id]
    )

    const { rows } = await client.query(
      'SELECT id FROM location_inventory WHERE inventory_id = $1 AND location_id = $2',
      [id, location_id]
    )

    if (rows.length > 0) {
      await client.query(
        'UPDATE location_inventory SET quantity = $1, low_stock_threshold = $2, updated_at = NOW() WHERE id = $3',
        [quantity, low_stock_threshold, rows[0].id]
      )
    } else {
      await client.query(
        'INSERT INTO location_inventory (inventory_id, location_id, quantity, low_stock_threshold, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())',
        [id, location_id, quantity, low_stock_threshold]
      )
    }

    await client.query('COMMIT')
    res.json({ message: 'Inventory updated successfully' })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Error updating inventory:', err)
    console.error('Error details:', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      constraint: err.constraint
    })
    
    // Handle unique constraint violation
    if (err.code === '23505' && (err.constraint === 'inventory_barcode_key' || err.constraint === 'inventory_user_barcode_unique')) {
      return res.status(400).json({ 
        error: `This barcode is already used by another item in your inventory.` 
      })
    }
    
    res.status(500).json({ error: err.message || 'Server error while updating inventory' })
  } finally {
    client.release()
  }
})


// ✅ Delete inventory from specific location (location_inventory) — scoped to user
router.delete('/:inventoryId/location/:locationId', verifyToken, async (req, res) => {
  const { inventoryId, locationId } = req.params
  const userId = req.user?.id

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // 🔐 Ensure inventory belongs to the user
    const { rowCount: invValid } = await client.query(
      'SELECT 1 FROM inventory WHERE id = $1 AND user_id = $2',
      [inventoryId, userId]
    )
    if (!invValid) {
      await client.query('ROLLBACK')
      return res.status(403).json({ error: 'You do not have permission to delete this inventory item' })
    }

    // Delete only from this location
    const result = await client.query(
      'DELETE FROM location_inventory WHERE inventory_id = $1 AND location_id = $2 RETURNING *',
      [inventoryId, locationId]
    )

    if (result.rowCount === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Inventory item at that location not found' })
    }

    // Check if this inventory has any other locations left
    const { rowCount } = await client.query(
      'SELECT 1 FROM location_inventory WHERE inventory_id = $1 LIMIT 1',
      [inventoryId]
    )

    // If no other locations exist, delete the base inventory item
    if (rowCount === 0) {
      await client.query('DELETE FROM inventory WHERE id = $1', [inventoryId])
    }

    await client.query('COMMIT')
    res.json({ message: 'Item deleted from location successfully' })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Error deleting inventory from location:', err)
    res.status(500).json({ error: 'Server error while deleting inventory' })
  } finally {
    client.release()
  }
})



// ✅ POST /api/inventory/transfer — secure transfer
router.post('/transfer', verifyToken, async (req, res) => {
  const {
    inventory_id,
    source_location_id,
    destination_location_id,
    quantity,
  } = req.body

  const userId = req.user?.id

  if (!inventory_id || !source_location_id || !destination_location_id || !quantity) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // 🔐 1. Ensure this inventory belongs to the logged-in user
    const { rowCount: validInv } = await client.query(
      'SELECT 1 FROM inventory WHERE id = $1 AND user_id = $2',
      [inventory_id, userId]
    )
    if (!validInv) {
      await client.query('ROLLBACK')
      return res.status(403).json({ error: 'Unauthorized access to inventory' })
    }

    // 2. Check source quantity (FOR UPDATE locks the row)
    const sourceResult = await client.query(
      `SELECT quantity FROM location_inventory 
       WHERE inventory_id = $1 AND location_id = $2 FOR UPDATE`,
      [inventory_id, source_location_id]
    )

    if (sourceResult.rows.length === 0) {
      throw new Error('Source inventory not found')
    }

    const sourceQty = sourceResult.rows[0].quantity
    if (sourceQty < quantity) {
      throw new Error('Not enough inventory at source location')
    }

    // 3. Subtract from source
    await client.query(
      `UPDATE location_inventory
       SET quantity = quantity - $1, updated_at = NOW()
       WHERE inventory_id = $2 AND location_id = $3`,
      [quantity, inventory_id, source_location_id]
    )

    // 4. Add to destination (insert or update)
    await client.query(
      `INSERT INTO location_inventory (inventory_id, location_id, quantity, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (inventory_id, location_id)
       DO UPDATE SET quantity = location_inventory.quantity + $3, updated_at = NOW()`,
      [inventory_id, destination_location_id, quantity]
    )

    await client.query('COMMIT')
    res.status(200).json({ success: true })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Inventory transfer failed:', err)
    res.status(500).json({ error: err.message || 'Transfer failed' })
  } finally {
    client.release()
  }
})



// ✅ POST /api/inventory/consume — scoped by user_id
router.post('/consume', verifyToken, async (req, res) => {
  const client = await pool.connect()
  try {
    const { location, supplies } = req.body
    const userId = req.user?.id

    if (!location || !supplies?.length) {
      return res.status(400).json({ error: 'Missing location or supplies' })
    }


    await client.query('BEGIN')

    for (const item of supplies) {
      const inventoryId = item.inventory_id
      const quantityToConsume = item.quantity

      if (!inventoryId || quantityToConsume <= 0) continue

      // 🔐 Validate ownership
      const validInvRes = await client.query(
        'SELECT 1 FROM inventory WHERE id = $1 AND user_id = $2',
        [inventoryId, userId]
      )
      if (validInvRes.rowCount === 0) {
        await client.query('ROLLBACK')
        return res.status(403).json({ error: `Unauthorized access to item ID ${inventoryId}` })
      }

      // 🔐 Lock and check quantity at location
      const { rows } = await client.query(
        `SELECT id, quantity FROM location_inventory 
         WHERE inventory_id = $1 AND location_id = $2 FOR UPDATE`,
        [inventoryId, location]
      )

      if (!rows.length) {
        await client.query('ROLLBACK')
        return res.status(404).json({ error: `Item ID ${inventoryId} not found at location ${location}` })
      }

      const currentQty = rows[0].quantity
      const locationInvId = rows[0].id

      if (currentQty < quantityToConsume) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: `Not enough quantity of item ID ${inventoryId} at location ${location}` })
      }

      // ✅ Subtract quantity
      await client.query(
        `UPDATE location_inventory 
         SET quantity = quantity - $1, updated_at = NOW()
         WHERE id = $2`,
        [quantityToConsume, locationInvId]
      )

    }

    await client.query('COMMIT')
    res.json({ message: 'Inventory consumed successfully' })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Error consuming inventory:', err)
    res.status(500).json({ error: 'Server error while consuming inventory' })
  } finally {
    client.release()
  }
})





export default router
