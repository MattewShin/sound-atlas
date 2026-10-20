import { emotionLabel, isFullyRated } from './emotions.js'

export const MAX_COMPOSERS = 3

// 곡 검색과 작곡가 검색에서 같은 영문 이름을 사용합니다. 선택 목록은 곡 데이터에서만 만듭니다.
export const composerAliases = {
  쇼팽: 'chopin', 베토벤: 'beethoven', 라흐마니노프: 'rachmaninoff rachmaninov',
  리스트: 'liszt', 사티: 'satie', 바흐: 'bach', 드뷔시: 'debussy',
  모차르트: 'mozart', 브람스: 'brahms', 슈베르트: 'schubert', 슈만: 'schumann',
  차이콥스키: 'tchaikovsky tchaikowsky',
}

export const getComposerOptions = (trackList) => [...new Set(trackList.filter(isFullyRated).map(({ composer }) => composer).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, 'ko'))

export const searchComposers = (composers, query = '') => {
  const terms = query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
  return composers.filter((name) => terms.every((term) => `${name} ${composerAliases[name] || ''}`.toLocaleLowerCase().includes(term)))
}

export const toggleComposer = (selected, name) => selected.includes(name)
  ? selected.filter((item) => item !== name)
  : selected.length < MAX_COMPOSERS ? [...selected, name] : selected

export const filterTracksByComposers = (trackList, selected = []) => selected.length
  ? trackList.filter(({ composer }) => selected.includes(composer)) : trackList

export const composerButtonLabel = (selected = []) => `작곡가 · ${selected.length ? selected[0] + (selected.length > 1 ? ` 외 ${selected.length - 1}명` : '') : '전체'}`

export const describeComposerConditions = (selected = [], keys = []) => !selected.length ? ''
  : keys.length ? `${selected.join(' · ')}의 곡 중 ‘${keys.map(emotionLabel).join(' · ')}’ 음악` : `${selected.join(' · ')}의 음악`
