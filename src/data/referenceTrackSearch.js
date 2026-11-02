import { composerAliases } from './composerSelection.js'
import { emotionKeys, getRepresentativeEmotions, isFullyRated } from './emotions.js'
import { cosineSimilarity, emotionVector } from './recommendations.js'

// Explicit catalogue/number tokens retain meaning: Op.4 is not No.4.
const tokenize = (value = '') => String(value).normalize('NFKD').replace(/\p{M}/gu, '').normalize('NFC').toLowerCase()
  .replace(/(?:opus|op)\s*\.?\s*(\d+(?:[-/]\d+)?)/g, ' opus$1 ')
  .replace(/(?:no|nr)\s*\.?\s*(\d+)|(?:제\s*)?(\d+)\s*번/g, (_, a, b) => ` number${a || b} `)
  .replace(/(\d+)\s*악장|movement\s*(\d+)/g, (_, a, b) => ` movement${a || b} `)
  .match(/(?:opus|number|movement)\d+(?:[-/]\d+)?|[a-z가-힣]+|\d+/g) || []

export const searchReferenceTracks = (trackList, query = '') => {
  const terms = tokenize(query.trim().slice(0, 160))
  if (!terms.length) return []
  return trackList.filter(isFullyRated).filter((track) => {
    const words = tokenize([track.title, track.titleEn, track.movement, track.alias,
      ...(track.aliases || []), composerAliases[track.composer], track.composer,
      track.movementNumber ? `movement${track.movementNumber}` : ''].filter(Boolean).join(' '))
    const compact = words.filter((word) => !/\d/.test(word)).join('')
    return terms.every((term) => /^\d+$/.test(term)
      ? words.some((word) => word.match(/\d+/g)?.includes(term))
      : /^(opus|number|movement)\d/.test(term) ? words.includes(term)
        : term.length < 2 || /^[a-z]{1,2}$/.test(term) ? words.includes(term) : compact.includes(term))
  }).sort((a, b) => a.composer.localeCompare(b.composer, 'ko')
    || a.title.localeCompare(b.title, 'ko', { numeric: true })
    || (a.movementNumber || 0) - (b.movementNumber || 0) || a.id.localeCompare(b.id))
}

// Existing catalogue IDs encode movements as -mN. Separate numbered pieces stay separate.
export const referenceWorkKey = (track) => track.workId || track.id.replace(/-m\d+$/, '')

export const getReferenceRecommendations = (trackList, reference, limit = 6) => {
  if (!isFullyRated(reference) || !Number.isInteger(limit) || limit < 1) return []
  const referenceVector = emotionVector(reference)
  const ranked = [...new Map(trackList.filter(isFullyRated)
    .filter((track) => referenceWorkKey(track) !== referenceWorkKey(reference))
    .map((track) => [track.id, track])).values()].map((track) => {
    const vector = emotionVector(track)
    const distance = Math.sqrt(vector.reduce((sum, value, index) => sum + (value - referenceVector[index]) ** 2, 0) / emotionKeys.length)
    const similarity = 0.65 * cosineSimilarity(referenceVector, vector) + 0.35 * (1 - distance)
    const shared = getRepresentativeEmotions(reference).filter(({ key }) => track.emotionScores[key] >= 3)
    return { track, similarity, reason: shared.length
      ? `${shared.map(({ label }) => label).join(' · ')} 감정이 함께 두드러져요.`
      : '아홉 가지 감정의 전체적인 분포가 가까워요.' }
  }).sort((a, b) => b.similarity - a.similarity || a.track.id.localeCompare(b.track.id))
  const selected = [], composerCounts = new Map(), works = new Set()
  const minimum = (ranked[0]?.similarity || 0) - 0.15
  for (const item of ranked) {
    const { track } = item
    if (item.similarity < minimum || works.has(referenceWorkKey(track)) || (composerCounts.get(track.composer) || 0) >= 2) continue
    selected.push(item); works.add(referenceWorkKey(track))
    composerCounts.set(track.composer, (composerCounts.get(track.composer) || 0) + 1)
    if (selected.length >= limit) break
  }
  return selected
}
