import { manualRatings } from './manualRatings.js'

export const composerPatterns = {
  쇼팽: /쇼팽|\bchopin\b/i, 베토벤: /베토벤|\bbeethoven\b/i,
  라흐마니노프: /라흐마니노프|\brachmanin(?:off|ov)\b/i,
  사티: /사티|\bsatie\b/i, 리스트: /리스트|\bliszt\b/i,
  차이콥스키: /차이콥스키|\btchaikovsk(?:y|i)\b|\btchaikowsky\b/i,
}
export const workTypePatterns = {
  'piano-concerto': /피아노\s*협주곡|piano\s+concerto/i,
  sonata: /소나타|\bsonata\b/i, ballade: /발라드|\bballade?s?\b/i,
  etude: /연습곡|\betudes?\b/i, prelude: /전주곡|\bpreludes?\b/i,
  elegy: /엘레지|\beleg(?:y|ie)\b/i, gymnopedie: /짐노페디|\bgymnopedies?\b/i,
  liebestraum: /사랑의\s*꿈|\bliebestraum(?:e)?\b/i,
  seasons: /사계|\b(?:the|four)\s+seasons\b|\bseasons\b/i,
}

// 기존 곡 ID를 변경하지 않고 악장 ID에서 부모 작품을 파생합니다.
export const getWorkId = (track) => track.movementNumber ? track.id.replace(/-m\d+$/, '') : track.id
const aliasTranslations = { 황제: ['Emperor'], 월광: ['Moonlight'] }
export const workCatalog = Object.fromEntries(manualRatings.map((track) => {
  const id = getWorkId(track)
  const siblings = manualRatings.filter((item) => getWorkId(item) === id)
  return [id, {
    id, title: track.title + (track.alias ? ` ‘${track.alias}’` : ''), titleEn: track.titleEn, alias: track.alias,
    aliases: [track.alias, ...(aliasTranslations[track.alias] || []), track.aliasEn, ...(track.aliasesEn || [])].filter(Boolean),
    composer: track.composer, type: track.type, cycleId: track.cycleId, monthEn: track.monthEn,
    opus: track.opus, opusPart: track.opusPart,
    opusSuffix: track.opusSuffix, number: track.number, catalogue: track.catalogue, catalogueNumber: track.catalogueNumber,
    trackIds: siblings.map(({ id }) => id),
  }]
}))
export const getTrackTarget = (trackId) => {
  const track = manualRatings.find(({ id }) => id === trackId)
  return track ? { trackId, workId: getWorkId(track), title: track.title, alias: track.alias, movement: track.movement,
    movementNumber: track.movementNumber, work: workCatalog[getWorkId(track)] } : null
}
