#!/usr/bin/env node

/**
 * Database monitoring script
 * Run this to check database connection health and pool status
 */

import { testConnection, getPoolStatus } from '../db/utils.js'
import pool from '../db/index.js'

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
}

const log = (color, message) => {
  console.log(`${color}${message}${colors.reset}`)
}

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const checkDatabaseHealth = async () => {
  console.log('\n' + '='.repeat(50))
  log(colors.blue, '🔍 Database Health Check')
  console.log('='.repeat(50))
  
  // Test connection
  log(colors.yellow, '\n📡 Testing database connection...')
  const isConnected = await testConnection()
  
  if (isConnected) {
    log(colors.green, '✅ Database connection: HEALTHY')
  } else {
    log(colors.red, '❌ Database connection: FAILED')
    return
  }
  
  // Pool status
  log(colors.yellow, '\n🏊 Connection Pool Status:')
  const poolStatus = getPoolStatus()
  console.log(`   Total connections: ${poolStatus.totalCount}`)
  console.log(`   Idle connections: ${poolStatus.idleCount}`)
  console.log(`   Waiting requests: ${poolStatus.waitingCount}`)
  
  // Memory usage
  log(colors.yellow, '\n💾 Memory Usage:')
  const memUsage = process.memoryUsage()
  console.log(`   RSS: ${formatBytes(memUsage.rss)}`)
  console.log(`   Heap Used: ${formatBytes(memUsage.heapUsed)}`)
  console.log(`   Heap Total: ${formatBytes(memUsage.heapTotal)}`)
  console.log(`   External: ${formatBytes(memUsage.external)}`)
  
  // Environment info
  log(colors.yellow, '\n🌍 Environment:')
  console.log(`   Node.js: ${process.version}`)
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log(`   Uptime: ${Math.floor(process.uptime())} seconds`)
  
  console.log('\n' + '='.repeat(50))
}

const monitorContinuously = async () => {
  log(colors.blue, '🔄 Starting continuous monitoring (Ctrl+C to stop)...')
  
  const interval = setInterval(async () => {
    await checkDatabaseHealth()
  }, 30000) // Check every 30 seconds
  
  // Initial check
  await checkDatabaseHealth()
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    log(colors.yellow, '\n👋 Stopping monitor...')
    clearInterval(interval)
    process.exit(0)
  })
}

// Parse command line arguments
const args = process.argv.slice(2)
const command = args[0]

switch (command) {
  case 'monitor':
  case 'continuous':
    monitorContinuously()
    break
  case 'check':
  case 'test':
  default:
    checkDatabaseHealth().then(() => process.exit(0))
    break
}
