// 📁 routes/stripeWebhook.js
import express from 'express'
import Stripe from 'stripe'
import pool from '../db/index.js'

// Setup
const router = express.Router()
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET

// ⚠️ IMPORTANT: this file is mounted at `/api/stripe/webhook` in server.js,
// so this route must be just '/'
router.post(
  '/',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature']
    let event

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret)
    } catch (err) {
      console.error('❌ Webhook signature verification failed:', err.message)
      return res.status(400).send(`Webhook Error: ${err.message}`)
    }

    // ✅ Handle successful payment
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const customerId = session.customer

      try {
        const result = await pool.query(
          'UPDATE users SET is_paid = true WHERE stripe_customer_id = $1',
          [customerId]
        )

        if (result.rowCount === 0) {
          console.warn(`⚠️ No user found with customer ID ${customerId}`)
        } else {
          console.log(`✅ User with customer ${customerId} marked as paid`)
        }
      } catch (err) {
        console.error('❌ DB update failed for checkout session:', err)
      }
    }

    // ✅ Handle subscription cancellation
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object
      const customerId = subscription.customer

      try {
        const result = await pool.query(
          'UPDATE users SET is_paid = false WHERE stripe_customer_id = $1',
          [customerId]
        )

        if (result.rowCount === 0) {
          console.warn(`⚠️ No user found for canceled customer ID ${customerId}`)
        } else {
          console.log(`✅ Subscription canceled — User ${customerId} downgraded to free`)
        }
      } catch (err) {
        console.error('❌ DB update failed for subscription cancellation:', err)
      }
    }

    res.sendStatus(200)
  }
)

export default router
