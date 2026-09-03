import { afterEach, describe, expect, it, vi } from 'vitest'
import { deliverTransactionalEmail } from './email-delivery'

describe('deliverTransactionalEmail', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the accepted Resend email id', async () => {
    await expect(
      deliverTransactionalEmail(
        async () => ({ data: { id: 'email_123' }, error: null }),
        'email-verification',
      ),
    ).resolves.toBe('email_123')
  })

  it('throws when Resend returns an error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(
      deliverTransactionalEmail(
        async () => ({ data: null, error: { name: 'validation_error' } }),
        'email-verification',
      ),
    ).rejects.toThrow('EMAIL_DELIVERY_FAILED')

    expect(consoleError).toHaveBeenCalledWith(
      '[auth] Transactional email delivery failed',
      expect.objectContaining({
        kind: 'email-verification',
        errorName: 'validation_error',
      }),
    )
  })

  it('throws when the provider returns no id', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(
      deliverTransactionalEmail(
        async () => ({ data: null, error: null }),
        'password-reset',
      ),
    ).rejects.toThrow('EMAIL_DELIVERY_FAILED')
  })
})
