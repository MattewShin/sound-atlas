import { manualRatings } from './manualRatings.js'
import { manualTrackDetails } from './manualTrackDetails.js'

export const composerPatterns = {
  쇼팽: /쇼팽|\bchopin\b/i, 베토벤: /베토벤|\bbeethoven\b/i,
  브람스: /브람스|\bbrahms\b/i, 모차르트: /모차르트|\bmozart\b/i,
  라흐마니노프: /라흐마니노프|\brachmanin(?:off|ov)\b/i,
  사티: /사티|\bsatie\b/i, 리스트: /리스트|\bliszt\b/i,
  슈베르트: /슈베르트|\bschubert\b/i,
  슈만: /슈만|\bschumann\b/i,
  차이콥스키: /차이콥스키|\btchaikovsk(?:y|i)\b|\btchaikowsky\b/i,
}
// 주제 원작자의 이름은 변주곡 작곡가와 구분합니다. 원문·인용은 수정하지 않습니다.
export const composerIdentityText = value => String(value || '')
  .replace(/\bon\s+(?:a|an|the)\s+theme\s+by\s+[^\n,;]*?(?=\s+(?:Op|BWV|KV|K|D|S|B)\.?\s*\d|$)/gi, ' ')
  .replace(/[가-힣]+\s*(?=주제에\s*의한\s*변주곡)/g, ' ')
export const workTypePatterns = {
  'piano-concerto': /피아노\s*협주곡|piano\s+concerto/i,
  sonata: /소나타|\bsonata\b/i, ballade: /발라드|\bballade?s?\b/i,
  etude: /연습곡|\betudes?\b/i, prelude: /전주곡|\bpreludes?\b/i,
  elegy: /엘레지|\beleg(?:y|ie)\b/i, gymnopedie: /짐노페디|\bgymnopedies?\b/i,
  liebestraum: /사랑의\s*꿈|\bliebestraum(?:e)?\b/i,
  'fantaisie-impromptu': /환상\s*즉흥곡|\bfantaisie[\s-]+impromptu\b/i,
  'polonaise-fantaisie': /환상\s*폴로네즈|\bpolonaise[\s-]+fantaisie\b/i,
  impromptu: /(?<!환상)(?<!환상 )즉흥곡|(?<!fantaisie-)(?<!fantaisie )\bimpromptus?\b/i,
  // 번호·작품번호 없는 Scherzo는 소나타의 악장명일 수 있습니다.
  scherzo: /(?:스케르초|\bscherzos?\b)(?=[^\n]*(?:\bop[.:]?\s*\d|\bno[.:]?\s*\d|제?\s*\d+\s*번))/i,
  polonaise: /(?<!환상)(?<!환상 )폴로네즈|\bpolonaises?\b(?![\s-]+fantaisie)/i,
  nocturne: /녹턴|\bnocturnes?\b/i,
  rhapsody: /랩소디|광시곡|\brhapsod(?:y|ies|ie)\b/i,
  capriccio: /카프리치오|\bcapricci(?:o|os)\b/i,
  intermezzo: /인터메조|간주곡|\bintermezz(?:o|i)\b/i,
  romance: /로망스|\bromances?\b/i,
  variations: /변주곡|주제와\s*변주|\bvariations?\b/i,
  fantasy: /환상곡|\bfantas(?:y|ia|ie)\b(?![\s-]+impromptu)/i,
  seasons: /사계|\b(?:the|four)\s+seasons\b|\bseasons\b/i,
  kinderszenen: /어린이(?:의)?\s*정경|\bkinderszenen\b/i,
  fantasiestucke: /환상소곡(?:집)?|\bfantasiestucke\b/i,
  kreisleriana: /크라이슬레리아나|\bkreisleriana\b/i,
  // Allegro alone remains a tempo label; this catalog entry explicitly names Op.8.
  allegro: /(?:알레그로|\ballegro\b)(?=[^\n]*\bop[.:]?\s*8\b)/i,
  arabeske: /아라베스크|\barabeske\b/i,
  blumenstuck: /꽃의\s*곡|\bblumenstuck\b/i,
  humoreske: /유모레스크|\bhumoreske\b/i,
  'annees-de-pelerinage': /순례의\s*해|\bannees\s+de\s+pelerinage\b/i,
  'venezia-e-napoli': /베네치아와\s*나폴리|\bvenezia\s+e\s+napoli\b/i,
  legend: /전설|\blegends?\b/i,
  'mephisto-waltz': /메피스토\s*왈츠|\bmephisto\s+waltz\b/i,
  consolation: /위안|\bconsolations?\b/i,
}

// 기존 곡 ID를 변경하지 않고 악장 ID에서 부모 작품을 파생합니다.
export const getWorkId = (track) => track.movementNumber ? track.id.replace(/-m\d+$/, '') : track.id
const aliasTranslations = { 황제: ['Emperor'], 월광: ['Moonlight'] }
export const musicalKeysIn = (text) => {
  const notes = { 다: 'C', 라: 'D', 마: 'E', 바: 'F', 사: 'G', 가: 'A', 나: 'B' }
  const korean = [...String(text || '').matchAll(/(올림|내림)?([다라마바사가나])(장조|단조)/g)]
    .map((match) => `${notes[match[2]]}${match[1] === '올림' ? '#' : match[1] === '내림' ? 'b' : ''}:${match[3] === '장조' ? 'major' : 'minor'}`)
  const english = [...String(text || '').matchAll(/\b([A-G])\s*(#|♯|b|♭|sharp|flat)?\s*(major|minor)\b/gi)]
    .map((match) => `${match[1].toUpperCase()}${/#|♯|sharp/i.test(match[2] || '') ? '#' : /b|♭|flat/i.test(match[2] || '') ? 'b' : ''}:${match[3].toLowerCase()}`)
  return [...new Set([...korean, ...english])]
}
export const workCatalog = Object.fromEntries(manualRatings.map((track) => {
  const id = getWorkId(track)
  const siblings = manualRatings.filter((item) => getWorkId(item) === id)
  return [id, {
    id, title: track.title + (track.alias ? ` ‘${track.alias}’` : ''), titleEn: track.titleEn, alias: track.alias,
    aliases: [track.alias, ...(aliasTranslations[track.alias] || []), track.aliasEn, ...(track.aliasesEn || [])].filter(Boolean),
    composer: track.composer, type: track.type, cycleId: track.cycleId, monthEn: track.monthEn,
    opus: track.opus, opusPart: track.opusPart,
    opusSuffix: track.opusSuffix, number: track.number, bookNumber: track.bookNumber, catalogue: track.catalogue, catalogueNumber: track.catalogueNumber,
    musicalKeys: [...new Set(siblings.flatMap(({ id }) => musicalKeysIn(manualTrackDetails[id]?.about)))],
    trackIds: siblings.map(({ id }) => id),
  }]
}))
export const getTrackTarget = (trackId) => {
  const track = manualRatings.find(({ id }) => id === trackId)
  return track ? { trackId, workId: getWorkId(track), title: track.title, alias: track.alias, movement: track.movement,
    movementNumber: track.movementNumber, work: workCatalog[getWorkId(track)] } : null
}
