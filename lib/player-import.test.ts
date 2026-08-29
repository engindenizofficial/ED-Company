import assert from "node:assert/strict"
import test from "node:test"
import { matchPlayer, normalizeName, type ApiPlayerCandidate, type CsvPlayer } from "./player-import"

const csv = (overrides: Partial<CsvPlayer> = {}): CsvPlayer => ({
  csvPlayerId: "1",
  name: "Rafael Leão",
  dateOfBirth: "1999-06-10",
  citizenship: "Portugal",
  subPosition: "Left Winger",
  marketValueEur: 75_000_000,
  ...overrides,
})
const api = (overrides: Partial<ApiPlayerCandidate> = {}): ApiPlayerCandidate => ({
  playerId: 10,
  name: "Rafael Leao",
  firstName: "Rafael",
  lastName: "Leão",
  dateOfBirth: "1999-06-10",
  nationality: "Portugal",
  teamId: 489,
  teamName: "AC Milan",
  teamCountry: "Italy",
  leagueId: 135,
  leagueName: "Serie A",
  leagueCountry: "Italy",
  ...overrides,
})

test("aksan ve tireleri normalize eder", () => {
  assert.equal(normalizeName("Jean-Clair Todibo"), "jean clair todibo")
  assert.equal(matchPlayer(csv(), [api()]).status, "matched")
})

test("ikinci ismi olan API kaydını ilk ve son adla eşleştirir", () => {
  assert.equal(matchPlayer(csv({ name: "Romelu Lukaku" }), [api({ name: "Romelu Menama Lukaku", firstName: "Romelu Menama", lastName: "Lukaku" })]).status, "matched")
})

test("aynı puandaki aynı isimleri belirsiz bırakır", () => {
  const result = matchPlayer(csv(), [api(), api({ playerId: 11, teamId: 40 })])
  assert.equal(result.status, "ambiguous")
})

test("doğum tarihi çakışmıyorsa eşleştirmez", () => {
  assert.equal(matchPlayer(csv(), [api({ dateOfBirth: "1999-06-11" })]).status, "unmatched")
})

test("takımı CSV'den değil API adayından alır", () => {
  const result = matchPlayer(csv(), [api({ teamId: 492, teamName: "Napoli" })])
  assert.equal(result.status, "matched")
  if (result.status === "matched") assert.equal(result.candidate.teamName, "Napoli")
})
