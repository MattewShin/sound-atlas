import '../server/concertBrowser.test.mjs'
import '../server/concertReliability.test.mjs'
import '../server/concertCacheSql.test.mjs'
import './concertBrowserUi.test.mjs'
import './emma/emma.test.js'
import '../src/data/recommendation.test.js'
import '../src/data/composerSelection.test.js'
import '../src/data/catalogAdditions.test.js'
import '../src/data/catalogAdditions20261020.test.js'
import '../src/data/catalogAdditions20261021.test.js'
import '../src/data/mobileTypography.test.js'
import '../src/data/halfPointRatings.test.js'
import '../src/data/storage.test.js'
import '../src/data/weeklySelections.test.js'
import '../src/data/homeDiscovery.test.js'
import '../src/data/concertSearch.test.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync, unlinkSync } from 'node:fs'
import { build } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { emotions, formatTrackTitle } from '../src/data/emotions.js'
import { composerImages, tracks, trackDetails } from '../src/data/musicData.js'
import { getLibraryPreferenceProfile, getRecommendationResult } from '../src/data/recommendations.js'
import { verifyMusicSelectionInteractions } from './musicSelectionDomTest.mjs'
import { verifyComposerSelectionInteractions } from './composerSelectionDomTest.mjs'
import { verifyWeeklySelectionInteractions } from './weeklySelectionDomTest.mjs'
import { verifyHomeDiscoveryInteractions } from './homeDiscoveryDomTest.mjs'
import { weeklySelections } from '../src/data/weeklySelections.js'
import { getWeeklySelectionState } from '../src/data/weeklySelectionHelpers.js'

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

test('작곡가 선택·검색·임시 변경·포커스·추천 조건·보관함 전환을 검증한다', async () => {
  await verifyComposerSelectionInteractions(components.default)
})

test('홈 탐색의 재진입·로그인·조건 변경·모달·보관 상태와 주간 소개 제목을 검증한다', async () => {
  await verifyHomeDiscoveryInteractions(components.default)
})

test('주간 소개에서 홈·글·상세·영상·보관함·지난 글의 연결을 검증한다', async () => {
  await verifyWeeklySelectionInteractions(components.default)
})

test('주간 소개는 긴 제목·선택 항목 생략·영상 없음·별도 구간을 렌더링한다', () => {
  const entry = getWeeklySelectionState(weeklySelections, tracks, '2026-10-14T03:00:00Z').current
  const props = { entry, detail: trackDetails[entry.trackId], PreviewPlayer: components.YouTubeShortEmbed }
  const html = render(components.WeeklySelectionScreen, props)
  assert.ok(html.includes('기존 곡 미리듣기 · 0:00–2:10'))
  assert.ok(!html.includes('<iframe'))
  const range = { videoId: props.detail.shortPreview.videoId, start: '0:30', end: '1:10' }
  assert.ok(render(components.WeeklySelectionScreen, { ...props, entry: { ...entry, previewRange: range } }).includes('선정자가 고른 구간 · 0:30–1:10'))
  const player = render(components.YouTubeShortEmbed, { track: entry.track, preview: { ...props.detail.shortPreview, startSeconds: 30, endSeconds: 70 } })
  assert.ok(player.includes('start=30&amp;end=70&amp;autoplay=0'))
  const noVideo = render(components.WeeklySelectionScreen, { ...props, detail: {}, entry: { ...entry, editorName: '' } })
  assert.ok(noVideo.includes('곡 자세히 보기'))
  assert.ok(!noVideo.includes('My Piano Mood 에디터'))
  assert.equal(render(components.WeeklySelectionSection, { entry: null }), '')
  assert.ok(render(components.WeeklySelectionSection, { entry: { ...entry, title: '아주 긴 제목'.repeat(50), track: { ...entry.track, title: '긴 곡명'.repeat(50) } } }).includes('아주 긴 제목'))
})
test('취향 차트는 4점·4.5점·두 점수 평균의 차이를 막대 값과 표시값에 반영한다', () => {
  const base = { ...tracks[0], emotionScores: Object.fromEntries(emotions.map(({ key }) => [key, 1])) }
  const integer = { ...base, id: 'integer', emotionScores: { ...base.emotionScores, tenderness: 4 } }
  const half = { ...base, id: 'half', emotionScores: { ...base.emotionScores, tenderness: 4.5 } }
  for (const [savedIds, value, label] of [[['integer'], 75, '75'], [['half'], 87.5, '87.5'], [['integer', 'half'], 81.25, '81.3']]) {
    const profile = getLibraryPreferenceProfile([integer, half], savedIds)
    const html = render(components.PreferenceScreen, { profile })
    assert.ok(html.includes(`<meter min="0" max="100" value="${value}" aria-label="부드러운"`))
    assert.ok(html.includes(`<strong>${label}</strong>`))
    assert.equal(profile.emotionProfile.tenderness * 100, value)
  }
})

test('느낌·기분의 선택 해제와 탭별 초기화·기분 후보 확대·직전 추천 제외·보관 시 대표곡 유지를 검증한다', async () => {
  await verifyMusicSelectionInteractions(components.default)
})
test('첫 화면에는 새 9개 선택과 활성곡만 있으며 Energy 선택은 없다', () => {
  const html = render(components.default)
  emotions.forEach(({ label }) => assert.ok(html.includes(label)))
  assert.ok(html.includes('느낌으로 시작하기') && html.includes('기분에서 시작하기'))
  const discoveryIds = [...html.matchAll(/class="mini-track" data-track-id="([^"]+)"/g)].map((match) => match[1])
  assert.equal(discoveryIds.length, 4)
  assert.equal(new Set(discoveryIds).size, 4)
  assert.ok(discoveryIds.every((id) => tracks.some((track) => track.id === id && track.ratingStatus === 'complete')))
  assert.ok(!/ENERGY|얼마나 깊게|강렬하게/.test(html))
})
test('전체 활성곡 상세·보관함은 제목·별칭·감상 정보·이미지와 정확한 영상 상태를 렌더링한다', () => {
  for (const track of tracks) {
    const html = render(components.TrackDetailSheet, { track, detail: trackDetails[track.id], selectedKeys: [], isOpen: true })
    assert.ok(html.includes(formatTrackTitle(track)))
    assert.ok(!html.includes('이 곡의 감정 평가'))
    assert.ok(!html.includes('emotion-score-list'))
    const preview = trackDetails[track.id]?.shortPreview
    assert.ok(html.includes(preview ? '음원 감상하기' : '미리듣기 준비 중'))
    assert.ok(html.includes(composerImages[track.composer]))
    assert.ok(!html.includes('<iframe'))
    if (track.movement) {
      const heading = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] || ''
      assert.equal((heading.match(new RegExp(track.movement, 'g')) ?? []).length, 1)
    }
    if (track.alias) assert.ok(html.includes(`<span class="track-alias"> [${track.alias}]</span></h2>`))
    if (track.summary) {
      assert.ok(html.includes(`<p class="track-detail-summary">${track.summary}</p>`))
      assert.ok(html.includes(trackDetails[track.id].about))
      assert.ok(html.includes(trackDetails[track.id].listeningTip))
    }
    assert.ok(!html.includes('별칭:'))
  }
  const library = render(components.LibraryScreen, { savedTracks: tracks })
  assert.equal((library.match(/class="saved-track-card/g) ?? []).length, tracks.length)
  assert.ok(library.includes('쇼팽 녹턴 Op.9 No.1'))
  tracks.slice(36).forEach((track) => assert.ok(library.includes(formatTrackTitle(track))))
  const missing = render(components.TrackDetailSheet, { track: { ...tracks[0], emotionScores: undefined }, selectedKeys: [], isOpen: true })
  assert.ok(!missing.includes('미평가'))
  assert.ok(!missing.includes('평가 검토 중'))
})
test('취향 미형성에는 차트를 만들지 않고 활성 프로필은 9개 고정 축을 사용한다', () => {
  const empty = render(components.PreferenceScreen, { profile: getLibraryPreferenceProfile(tracks, []) })
  assert.ok(empty.includes('아직 취향이 형성되지'))
  assert.ok(!empty.includes('<meter'))
  const html = render(components.PreferenceScreen, { profile: getLibraryPreferenceProfile(tracks, [tracks[0].id]) })
  assert.equal((html.match(/<meter/g) ?? []).length, 9)
  assert.equal((html.match(/min="0" max="100"/g) ?? []).length, 9)
  assert.ok(html.includes('초기 취향') && html.includes('상위 감정: 힘찬'))
  assert.ok(!html.includes('(공동)'))
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

test('곡 상세와 보관함에서 공연 검색 버튼을 제거하고 보관 동작은 유지한다',()=>{
 const props={track:tracks[0],detail:trackDetails[tracks[0].id],selectedKeys:[],isOpen:true,onToggleSave(){},onGoLibrary(){}}
 for(const isSaved of [false,true]){const html=render(components.TrackDetailSheet,{...props,isSaved});assert.ok(!html.includes('이 곡의 공연 찾기'));assert.equal(html.includes('보관함으로 가기'),isSaved)}
 assert.ok(!render(components.LibraryScreen,{savedTracks:tracks}).includes('이 곡의 공연 찾기'))
})
