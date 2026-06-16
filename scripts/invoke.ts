// Run MCP tools directly — for testing and seeding without Claude Desktop
// Usage: TOAD_ID=dave@rusty.pond npx tsx scripts/invoke.ts

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', 'src/mcp.ts'],
  env: {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL ?? 'sqlite://./opentoad.db',
    POND_PRIVATE_KEY: process.env.POND_PRIVATE_KEY ?? '',
    TOAD_ID: process.env.TOAD_ID ?? '',
  },
})

const client = new Client({ name: 'invoke', version: '0.1.0' })
await client.connect(transport)

const tool = process.argv[2]
const args = process.argv[3] ? JSON.parse(process.argv[3]) : {}

const result = await client.callTool({ name: tool, arguments: args })
console.log(JSON.stringify(result, null, 2))

await client.close()
