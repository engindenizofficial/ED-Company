import { syncLeagueMarketValues } from "../lib/market-value-sync"

async function main() {
  const result = await syncLeagueMarketValues(203) // Süper Lig
  console.log(JSON.stringify(result, null, 2))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
