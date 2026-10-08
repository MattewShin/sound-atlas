import './emma/emma.test.js'
import '../src/data/recommendation.test.js'
import '../src/data/storage.test.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync, unlinkSync } from 'node:fs'
import { build } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { emotions, formatTrackTitle } from '../src/data/emotions.js'
import { composerImages, tracks, trackDetails } from '../src/data/musicData.js'
import { getLibraryPreferenceProfile, getRecommendationResult } from '../src/data/recommendations.js'

// JSX를 실제 컴파일해 화면의 렌더링 경로와 카탈로그 연결을 확인합니다.
const compiledPath = new URL('../src/.App.ssr.local.mjs', import.meta.url)
let components
try {
  const result = await build({ entryPoints: ['src/App.jsx'], bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false })
  writeFileSync(compiledPath, result.outputFiles[0].text)
  components = await import(compiledPath.href)
} finally {
  try { unlinkSync(compiledPath) } catch { /* 컴파일 실패 시 파일 없음 */ }
}
const render = (component, props = {}) => renderToStaticMarkup(React.createElement(component, props))
test('첫 화면에는 새 9개 선택과 활성곡만 있으며 Energy 선택은 없다', () => {
  const html = render(components.default)
  emotions.forEach(({ label }) => assert.ok(html.includes(label)))
  assert.ok(html.includes('느낌으로 시작하기') && html.includes('기분에서 시작하기'))
  assert.ok(html.includes('쇼팽 연습곡 Op.10 No.3'))
  assert.ok(html.includes('<span class="track-alias">이별의 곡</span></strong>'))
  assert.ok(!/ENERGY|얼마나 깊게|강렬하게|녹턴/.test(html))
})
test('전체 활성곡 상세·보관함은 제목·별칭·점수·이미지와 정확한 영상 상태를 렌더링한다', () => {
  for (const track of tracks) {
    const html = render(components.TrackDetailSheet, { track, detail: trackDetails[track.id], selectedKeys: [], isOpen: true })
    assert.ok(html.includes(formatTrackTitle(track)))
    assert.equal((html.match(/<dt>/g) ?? []).length, 9)
    const preview = trackDetails[track.id]?.shortPreview
    assert.ok(html.includes(preview ? '음원 감상하기' : '미리듣기 준비 중'))
    assert.ok(html.includes(composerImages[track.composer]))
    assert.ok(!html.includes('<iframe'))
    if (track.movement) assert.equal((html.match(new RegExp(track.movement, 'g')) ?? []).length, 1)
    if (track.alias) assert.ok(html.includes(`<span class="track-alias">${track.alias}</span></h2>`))
    assert.ok(!html.includes('별칭:'))
  }
  const library = render(components.LibraryScreen, { savedTracks: tracks })
  assert.equal((library.match(/class="saved-track-card/g) ?? []).length, tracks.length)
  assert.ok(!/녹턴/.test(library))
  tracks.slice(36).forEach((track) => assert.ok(library.includes(formatTrackTitle(track))))
  const missing = render(components.TrackDetailSheet, { track: { ...tracks[0], emotionScores: undefined }, selectedKeys: [], isOpen: true })
  assert.equal((missing.match(/미평가/g) ?? []).length, 9)
  assert.ok(missing.includes('평가 검토 중'))
})
test('취향 미형성에는 차트를 만들지 않고 활성 프로필은 9개 고정 축을 사용한다', () => {
  const empty = render(components.PreferenceScreen, { profile: getLibraryPreferenceProfile(tracks, []) })
  assert.ok(empty.includes('아직 취향이 형성되지'))
  assert.ok(!empty.includes('<meter'))
  const html = render(components.PreferenceScreen, { profile: getLibraryPreferenceProfile(tracks, [tracks[0].id]) })
  assert.equal((html.match(/<meter/g) ?? []).length, 9)
  assert.equal((html.match(/min="0" max="100"/g) ?? []).length, 9)
  assert.ok(html.includes('초기 취향') && html.includes('(공동)'))
})

test('메인의 가로 추천 카드는 대표곡을 제외한 상위 8곡까지만 표시한다', () => {
  const ranked = getRecommendationResult(tracks, ['power']).tracks
  const featured = ranked[2]
  const relatedTracks = ranked.filter((track) => track.id !== featured.id)
  const html = render(components.RelatedRecommendations, { relatedTracks })
  const titles = [...html.matchAll(/<strong>([^<]*)(?:<span class="track-alias">[^<]*<\/span>)?<\/strong>/g)].map((match) => match[1])
  assert.deepEqual(titles, relatedTracks.slice(0, 8).map(formatTrackTitle))
  assert.equal((html.match(/class="mini-track"/g) ?? []).length, 8)
  assert.ok(html.includes('추천곡 더 보기'))
  const few = render(components.RelatedRecommendations, { relatedTracks: relatedTracks.slice(0, 2) })
  assert.equal((few.match(/class="mini-track"/g) ?? []).length, 2)
  assert.equal(render(components.RelatedRecommendations, { relatedTracks: [] }), '')
})

test('전체 추천 목록은 20곡씩 같은 순위의 다음 곡을 추가하고 마지막에서 불러오기를 끝낸다', () => {
  const ranked = getRecommendationResult(tracks, ['power', 'joy', 'tension']).tracks
  assert.ok(ranked.length > 40)
  let priorTitles = []
  for (const visibleCount of [20, 40, 60, 80]) {
    const html = render(components.RecommendationListScreen, { recommendedTracks: ranked, selectedKeys: ['power', 'joy', 'tension'], visibleCount })
    const titles = [...html.matchAll(/<strong>([^<]*)(?:<span class="track-alias">[^<]*<\/span>)?<\/strong>/g)].map((match) => match[1]).slice(1)
    assert.deepEqual(titles, ranked.slice(0, visibleCount).map(formatTrackTitle))
    assert.deepEqual(titles.slice(0, priorTitles.length), priorTitles)
    assert.equal(new Set(titles).size, titles.length)
    assert.equal(html.includes('더 불러오기'), visibleCount < ranked.length)
    assert.equal(html.includes('추천곡을 모두 확인했어요.'), visibleCount >= ranked.length)
    assert.ok(html.includes(`${ranked.length}곡 중 ${Math.min(visibleCount, ranked.length)}곡 표시`))
    priorTitles = titles
  }
  const first = render(components.RecommendationListScreen, { recommendedTracks: ranked })
  assert.equal((first.match(/class="recommendation-list-card"/g) ?? []).length, 20)
  const changed = getRecommendationResult(tracks, ['nostalgia']).tracks
  const changedHtml = render(components.RecommendationListScreen, { recommendedTracks: changed, selectedKeys: ['nostalgia'] })
  assert.equal((changedHtml.match(/class="recommendation-list-card"/g) ?? []).length, Math.min(20, changed.length))
  assert.ok(changedHtml.includes('몽환적인'))
})

test('전체 목록은 후보 부족·빈 결과 및 보관 여부도 표시한다', () => {
  const few = render(components.RecommendationListScreen, { recommendedTracks: tracks.slice(0, 2), isTrackSaved: (id) => id === tracks[0].id })
  assert.equal((few.match(/class="recommendation-list-card"/g) ?? []).length, 2)
  assert.ok(!few.includes('더 불러오기'))
  assert.equal((few.match(/aria-pressed="true"/g) ?? []).length, 1)
  const empty = render(components.RecommendationListScreen, { recommendedTracks: [] })
  assert.ok(empty.includes('추천할 곡이 아직 없어요'))
  assert.ok(!empty.includes('더 불러오기'))
})
