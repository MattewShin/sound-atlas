import { getWorkId, workCatalog } from './workCatalog.js'

const composerAliases = {
  쇼팽: 'chopin', 베토벤: 'beethoven', 라흐마니노프: 'rachmaninoff rachmaninov',
  리스트: 'liszt', 사티: 'satie', 바흐: 'bach', 드뷔시: 'debussy',
  모차르트: 'mozart', 슈베르트: 'schubert', 슈만: 'schumann',
  차이콥스키: 'tchaikovsky tchaikowsky',
}
const typeAliases = {
  ballade: 'ballade', 'piano-concerto': 'piano concerto', sonata: 'sonata',
  etude: 'etude', prelude: 'prelude', elegy: 'elegy', gymnopedie: 'gymnopedie',
  liebestraum: 'liebestraum',
  impromptu: 'impromptu',
  scherzo: 'scherzo', polonaise: 'polonaise',
  'fantaisie-impromptu': 'fantaisie impromptu', 'polonaise-fantaisie': 'polonaise fantaisie',
  seasons: 'the seasons four seasons',
}

const normalize = (value) => String(value || '').normalize('NFKC').toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

export function trackSearchText(track) {
  const work = workCatalog[getWorkId(track)]
  return normalize([
    track.composer, composerAliases[track.composer], track.title, track.titleEn, track.alias, track.aliasEn,
    ...(track.aliasesEn || []),
    track.movement, track.id, work?.title, ...(work?.aliases || []),
    typeAliases[track.type], track.opus != null && `op ${track.opus} op.${track.opus}`,
    track.number != null && `no ${track.number} no.${track.number} ${track.number}번 제${track.number}번`,
    track.catalogue, track.catalogueNumber,
  ].filter(Boolean).join(' '))
}

export function searchConcertTracks(tracks, query, limit = 100) {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  return tracks.filter((track) => {
    const text = trackSearchText(track)
    return terms.every((term) => text.includes(term))
  }).slice(0, limit)
}
