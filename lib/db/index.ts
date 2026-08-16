import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

// pg-connection-string emits a deprecation warning when sslmode is
// 'prefer' | 'require' | 'verify-ca' since those will stop being aliases
// for 'verify-full' in a future major version. Pin to 'verify-full'
// explicitly so the current (secure) behavior is preserved without the
// build-time warning.
function withVerifyFullSslMode(connectionString: string | undefined) {
  if (!connectionString) return connectionString
  try {
    const url = new URL(connectionString)
    if (url.searchParams.has('sslmode')) {
      url.searchParams.set('sslmode', 'verify-full')
    }
    return url.toString()
  } catch {
    return connectionString
  }
}

export const pool = new Pool({
  connectionString: withVerifyFullSslMode(process.env.DATABASE_URL),
})

export const db = drizzle(pool, { schema })
