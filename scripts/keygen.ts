import { generateKeyPairSync } from 'crypto'

const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})

const strip = (pem: string) => pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')

console.log('# Add these to your .env\n')
console.log(`POND_PRIVATE_KEY=${strip(privateKey)}`)
console.log(`POND_PUBLIC_KEY=${strip(publicKey)}`)
console.log('\n# Public key also goes in /.well-known/opentoad when federation is ready')
