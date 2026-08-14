'use client'

import { createAuthClient } from 'better-auth/react'
import { emailOTPClient } from 'better-auth/client/plugins'

// Public Google OAuth client ID (safe to expose client-side).
// Hardcoded intentionally: this value is not read from an environment
// variable, unlike GOOGLE_CLIENT_ID (server-only, kept in env).
export const GOOGLE_CLIENT_ID =
  '899292286474-i2micmgp4j9h6ot8m4hochadkqlv2nrn.apps.googleusercontent.com'

export const authClient = createAuthClient({
  plugins: [emailOTPClient()],
})

export const { signIn, signUp, signOut, useSession } = authClient
