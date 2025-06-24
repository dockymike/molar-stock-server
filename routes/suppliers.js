import express from 'express'
import pool from '../db/index.js'
import { verifyToken } from '../auth/verifyToken.js'

const router = express.Router()
router.use(verifyToken)

// ✅ Create new supplier
router.post('/', async (req, res) => {
  const { user_id, name, poc, email, phone, web_link } = req.body
  try {
    const result = await pool.query(
      `INSERT INTO suppliers (user_id, name, poc, email, phone, web_link)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [user_id, name, poc, email, phone, web_link]
    )
    res.json(result.rows[0])
  } catch (err) {
    console.error('❌ Error creating supplier:', err)
    res.status(500).json({ error: 'Could not create supplier' })
  }
})

// ✅ Get suppliers for user
router.get('/:user_id', async (req, res) => {
  const { user_id } = req.params
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

// ✅ Update supplier
router.put('/:id', async (req, res) => {
  const { id } = req.params
  const { name, poc, email, phone, web_link } = req.body
  try {
    const result = await pool.query(
      `UPDATE suppliers
       SET name = $1, poc = $2, email = $3, phone = $4, web_link = $5
       WHERE id = $6
       RETURNING *`,
      [name, poc, email, phone, web_link, id]
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Supplier not found' })
    res.json(result.rows[0])
  } catch (err) {
    console.error('Error updating supplier:', err)
    res.status(500).json({ error: 'Could not update supplier' })
  }
})

// ✅ Delete supplier
router.delete('/:id', async (req, res) => {
  const { id } = req.params
  try {
    await pool.query('DELETE FROM suppliers WHERE id = $1', [id])
    res.json({ success: true })
  } catch (err) {
    console.error('Error deleting supplier:', err)
    res.status(500).json({ error: 'Could not delete supplier' })
  }
})

export default router
