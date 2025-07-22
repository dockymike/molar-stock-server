import express from 'express'
import pool from '../db/index.js'
import { verifyToken } from '../auth/verifyToken.js'

const router = express.Router()
router.use(verifyToken)

/**
 * ✅ Create new supplier
 */
router.post('/', async (req, res) => {
  const { name, poc, email, phone, web_link } = req.body
  const user_id = req.user.id

  try {
    const result = await pool.query(
      `INSERT INTO suppliers (user_id, name, poc, email, phone, web_link)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [user_id, name, poc, email, phone, web_link]
    )
    res.json(result.rows[0])
  } catch (err) {
    console.error('Error creating supplier:', err)
    res.status(500).json({ error: 'Could not create supplier' })
  }
})

/**
 * ✅ Get all suppliers for the logged-in user
 */
router.get('/', async (req, res) => {
  const user_id = req.user.id

  try {
    const result = await pool.query(
      'SELECT * FROM suppliers WHERE user_id = $1 ORDER BY id',
      [user_id]
    )
    res.json(result.rows)
  } catch (err) {
    console.error('Error fetching suppliers:', err)
    res.status(500).json({ error: 'Could not fetch suppliers' })
  }
})

/**
 * ✅ Update supplier by ID
 */
router.put('/:id', async (req, res) => {
  const { id } = req.params
  const { name, poc, email, phone, web_link } = req.body
  const user_id = req.user.id

  try {
    const ownerCheck = await pool.query(
      'SELECT 1 FROM suppliers WHERE id = $1 AND user_id = $2',
      [id, user_id]
    )
    if (ownerCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Forbidden: You do not own this supplier.' })
    }

    const result = await pool.query(
      `UPDATE suppliers
       SET name = $1, poc = $2, email = $3, phone = $4, web_link = $5
       WHERE id = $6 AND user_id = $7
       RETURNING *`,
      [name, poc, email, phone, web_link, id, user_id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Supplier not found' })
    }

    res.json(result.rows[0])
  } catch (err) {
    console.error('Error updating supplier:', err)
    res.status(500).json({ error: 'Could not update supplier' })
  }
})

/**
 * ✅ Delete supplier if not in use
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params
  const user_id = req.user.id
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const ownerCheck = await client.query(
      'SELECT 1 FROM suppliers WHERE id = $1 AND user_id = $2',
      [id, user_id]
    )
    if (ownerCheck.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(403).json({ error: 'Forbidden: You do not own this supplier.' })
    }

    const inUse = await client.query(
      'SELECT 1 FROM inventory WHERE supplier_id = $1 AND user_id = $2 LIMIT 1',
      [id, user_id]
    )
    if (inUse.rows.length > 0) {
      await client.query('ROLLBACK')
      return res.status(400).json({
        error: 'This supplier is still assigned to one or more supplies. Remove or reassign them first.',
      })
    }

    const result = await client.query(
      'DELETE FROM suppliers WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, user_id]
    )

    await client.query('COMMIT')

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Supplier not found or already deleted' })
    }

    res.json({ success: true })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Error deleting supplier:', err)
    res.status(500).json({ error: 'Could not delete supplier' })
  } finally {
    client.release()
  }
})

export default router
