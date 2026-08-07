'use client'

import { createAuthClient } from 'better-auth/react'
import { emailOtpClient } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  plugins: [emailOtpClient()],
})

export const { signIn, signUp, signOut, useSession } = authClient
