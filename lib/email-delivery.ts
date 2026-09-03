type EmailDeliveryError = {
  name?: string
}

type EmailDeliveryResult = {
  data?: { id?: string } | null
  error?: EmailDeliveryError | null
}

export async function deliverTransactionalEmail(
  send: () => Promise<EmailDeliveryResult>,
  kind: 'email-verification' | 'password-reset',
) {
  const result = await send()

  if (result.error || !result.data?.id) {
    console.error('[auth] Transactional email delivery failed', {
      kind,
      errorName: result.error?.name ?? 'UNKNOWN_EMAIL_DELIVERY_ERROR',
    })
    throw new Error('EMAIL_DELIVERY_FAILED')
  }

  return result.data.id
}
