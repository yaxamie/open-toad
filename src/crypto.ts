import { createSign, createVerify } from 'crypto'

const wrapPem = (b64: string, type: 'public' | 'private') => {
  const label = type === 'public' ? 'PUBLIC KEY' : 'PRIVATE KEY'
  const body = b64.match(/.{1,64}/g)!.join('\n')
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`
}

// canonical message for a croak or ribbit post
export const sigMessage = (fields: {
  toad_id: string
  timestamp: number
  pad?: string
  title?: string
  body: string
}) => [fields.toad_id, fields.timestamp, fields.pad ?? '', fields.title ?? '', fields.body].join('|')

export const signRequest = (message: string, privateKeyB64: string): string => {
  const pem = wrapPem(privateKeyB64, 'private')
  const sign = createSign('SHA256')
  sign.update(message)
  return sign.sign(pem, 'base64')
}

export const verifyRequest = (message: string, signature: string, publicKeyB64: string): boolean => {
  try {
    const pem = wrapPem(publicKeyB64, 'public')
    const verify = createVerify('SHA256')
    verify.update(message)
    return verify.verify(pem, signature, 'base64')
  } catch {
    return false
  }
}

export const TIMESTAMP_WINDOW_MS = 5 * 60 * 1000 // 5 minutes

export const timestampValid = (timestamp: number) =>
  Math.abs(Date.now() - timestamp) < TIMESTAMP_WINDOW_MS
