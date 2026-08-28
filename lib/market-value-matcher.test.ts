import assert from "node:assert/strict"
import test from "node:test"
import {
  matchPlayers,
  matchTeams,
  normalizeTeamName,
  playerSimilarityScore,
  teamSimilarityScore,
  type StagedEntity,
} from "./market-value-matcher"

function entity(externalId: string, name: string, country: string | null = null): StagedEntity {
  return { externalId, name, country, valueEur: null }
}

test("kulüp eklerini kimlik taşıyan kelimelere dokunmadan temizler", () => {
  assert.equal(normalizeTeamName("Galatasaray SK"), "galatasaray")
  assert.equal(normalizeTeamName("FC Internazionale Milano"), "internazionale milan")
  assert.ok(teamSimilarityScore("Bayern München", "FC Bayern Munich") >= 88)
})

test("kısaltılmış oyuncu adını aynı soyad ve baş harfle tanır", () => {
  assert.ok(playerSimilarityScore("K. Ayhan", "Kaan Ayhan") >= 92)
  assert.ok(playerSimilarityScore("M. Salah", "Mohamed Salah") >= 92)
  assert.ok(playerSimilarityScore("J. Silva", "A. Silva") < 92)
})

test("yüksek güvenli ve karşılıklı en iyi takım çiftlerini otomatik eşleştirir", () => {
  const results = matchTeams(
    [entity("1", "Galatasaray", "Türkiye"), entity("2", "Fenerbahçe SK", "Türkiye")],
    [entity("a", "Galatasaray SK", "Turkey"), entity("b", "Fenerbahce", "Turkey")],
  )

  assert.deepEqual(results.map((result) => [result.af?.externalId, result.tm?.externalId, result.status]), [
    ["1", "a", "matched"],
    ["2", "b", "matched"],
  ])
})

test("benzer iki aday arasında yeterli fark yoksa otomatik eşleştirmez", () => {
  const [result] = matchTeams(
    [entity("1", "United City", "England")],
    [entity("a", "United City FC", "England"), entity("b", "United City AFC", "England")],
  )

  assert.equal(result.status, "review")
  assert.ok(result.tm)
})

test("ülke çelişkisi olan takımı isim aynı olsa bile otomatik eşleştirmez", () => {
  const [result] = matchTeams(
    [entity("1", "Rangers", "Scotland")],
    [entity("a", "Rangers FC", "Chile")],
  )

  assert.equal(result.status, "review")
})

test("zayıf aday güçlü eşleşmenin Transfermarkt kaydını tüketemez", () => {
  const results = matchTeams(
    [entity("weak", "Real", "Spain"), entity("strong", "Real Sociedad", "Spain")],
    [entity("tm", "Real Sociedad de Futbol", "Spain")],
  )

  assert.equal(results.find((result) => result.af?.externalId === "strong")?.status, "matched")
  assert.notEqual(results.find((result) => result.af?.externalId === "weak")?.tm?.externalId, "tm")
})

test("aynı kadrodaki kesin oyuncu eşleşmelerini otomatik yapar", () => {
  const results = matchPlayers(
    [entity("1", "K. Ayhan"), entity("2", "M. Salah")],
    [entity("a", "Kaan Ayhan"), entity("b", "Mohamed Salah")],
  )

  assert.deepEqual(results.map((result) => result.status), ["matched", "matched"])
})
