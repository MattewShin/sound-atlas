// 최초 탐색에는 아직 선택 조건이 없으므로, 기존 추천 엔진이 허용한 후보 전체를 사용합니다.
// 감정/취향을 선택한 후의 대표곡·추천 순위는 이 추첨과 별개로 유지합니다.
export const DISCOVERY_CARD_COUNT = 4
export const DISCOVERY_SESSION_KEY = 'classic-atlas-home-discovery-v1'

export function selectDiscoveryTracks(candidates, previousIds = [], count = DISCOVERY_CARD_COUNT, random = Math.random) {
  const remaining = [...new Map(candidates.filter((track) => track?.id).map((track) => [track.id, track])).values()]
  const previous = new Set(previousIds), result = [], composers = new Set()
  while (remaining.length && result.length < count) {
    const lastComposer = result.at(-1)?.composer
    // 새 곡 우선. 후보가 부족하면 직전 곡도 허용하고, 가능한 작곡가를 번갈아 배치합니다.
    const alternating = remaining.filter((track) => track.composer !== lastComposer)
    let pool = alternating.length ? alternating : remaining
    const fresh = pool.filter((track) => !previous.has(track.id))
    if (fresh.length) pool = fresh
    const newComposers = pool.filter((track) => !composers.has(track.composer))
    if (newComposers.length) pool = newComposers
    const draw = random()
    const index = Number.isFinite(draw) ? Math.min(pool.length - 1, Math.max(0, Math.floor(draw * pool.length))) : 0
    const selected = pool[index]
    result.push(selected)
    composers.add(selected.composer)
    remaining.splice(remaining.findIndex((track) => track.id === selected.id), 1)
  }
  return result
}

export function readDiscoveryIds() {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(DISCOVERY_SESSION_KEY))
    return Array.isArray(value) ? value.filter((id) => typeof id === 'string') : []
  } catch { return [] }
}

export function saveDiscoveryIds(ids) {
  try { window.sessionStorage.setItem(DISCOVERY_SESSION_KEY, JSON.stringify(ids)) } catch { /* 저장 차단 시 현재 화면 상태만 유지 */ }
}
