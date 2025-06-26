import express from 'express'
import pool from '../db/index.js'
import { verifyToken } from '../auth/verifyToken.js'

const router = express.Router()
router.use(verifyToken)

// Create a new category
router.post('/', async (req, res) => {
  const { user_id, name } = req.body
  try {
    const result = await pool.query(
      'INSERT INTO inventory_categories (user_id, name) VALUES ($1, $2) RETURNING *',
      [user_id, name]
    )
    res.json(result.rows[0])
  } catch (err) {
    console.error('Error creating category:', err)
    res.status(500).json({ error: 'Could not create category' })
  }
})

// Get all categories for a user
router.get('/:user_id', async (req, res) => {
  const { user_id } = req.params
  try {
    const result = await pool.query(
      'SELECT * FROM inventory_categories WHERE user_id = $1 ORDER BY id',
      [user_id]
    )
    res.json(result.rows)
  } catch (err) {
    console.error('Error fetching categories:', err)
    res.status(500).json({ error: 'Could not fetch categories' })
  }
})

// ✅ Update category
router.put('/:id', async (req, res) => {
  const { id } = req.params
  const { name } = req.body
  try {
    const result = await pool.query(
      `UPDATE inventory_categories SET name = $1 WHERE id = $2 RETURNING *`,
      [name, id]
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Category not found' })
    res.json(result.rows[0])
  } catch (err) {
    console.error('Error updating category:', err)
    res.status(500).json({ error: 'Could not update category' })
  }
})

// ✅ Delete category with error if in use
router.delete('/:id', async (req, res) => {
  const { id } = req.params
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    // Check if any supplies use this category
    const inUse = await client.query(
      'SELECT 1 FROM supplies WHERE category_id = $1 LIMIT 1',
      [id]
    )

    if (inUse.rows.length > 0) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'This category is still assigned to one or more supplies. Remove those assignments first or consider simply renaming this category.' })
    }

    await client.query('DELETE FROM inventory_categories WHERE id = $1', [id])
    await client.query('COMMIT')

    res.json({ success: true })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Error deleting category:', err)
    res.status(500).json({ error: 'Could not delete category' })
  } finally {
    client.release()
  }
})


export default router
