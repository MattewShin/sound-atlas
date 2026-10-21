import './emma/emma.test.js'
import '../src/data/recommendation.test.js'
import '../src/data/composerSelection.test.js'
import '../src/data/catalogAdditions.test.js'
import '../src/data/catalogAdditions20261020.test.js'
import '../src/data/mobileTypography.test.js'
import '../src/data/halfPointRatings.test.js'
import '../src/data/storage.test.js'
import '../src/data/weeklySelections.test.js'
import '../src/data/homeDiscovery.test.js'
import '../src/data/concertRecommendations.test.js'
import '../src/data/concertSearch.test.js'
import '../server/kopis.test.mjs'
import './testConcertCollection.mjs'
import './testEasyOcr.mjs'
import './testProgramAnalysis.mjs'
import '../server/vercel.test.mjs'
import '../server/supabaseConcertSearch.test.mjs'
import '../server/concertPipeline.test.mjs'
import '../server/pipelineAnalysisOnly.test.mjs'
import '../server/pipelineDeadline.test.mjs'
import '../server/pipelinePriority.test.mjs'
import '../server/pipelineRecovery.test.mjs'
import '../server/concertCleanupSql.test.mjs'
import '../server/pipelineCleanup.test.mjs'
import '../server/pipelineWindows.test.mjs'
import '../server/programMatching.test.mjs'
import '../server/programOcr.test.mjs'
import '../server/concertSearchV1.test.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync, unlinkSync } from 'node:fs'
import { build } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { emotions, formatTrackTitle } from '../src/data/emotions.js'
import { composerImages, tracks, trackDetails } from '../src/data/musicData.js'
import { getLibraryPreferenceProfile, getRecommendationResult } from '../src/data/recommendations.js'
import { analyzeConcert } from '../src/data/concertRecommendations.js'
import { concertWorks } from '../src/data/concerts.js'
import { searchConcertTracks } from '../src/data/concertTrackSearch.js'
import { verifyConcertSearchInteractions } from './concertSearchDomTest.mjs'
import { verifyTargetConcertInteractions } from './targetConcertDomTest.mjs'
import { verifyDbConcertInteractions } from './dbConcertDomTest.mjs'
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
test('공연 악장 점수는 정수 4와 소수점 4.5를 그대로 표시한다', () => {
  const track = { ...tracks[0], emotionScores: Object.fromEntries(emotions.map(({ key }) => [key, 1])) }
  track.emotionScores.tenderness = 4.5
  track.emotionScores.peacefulness = 4
  const html = render(components.ConcertMovement, { track, work: { title: '테스트 작품' } })
  assert.ok(html.includes('부드러운 4.5/5'))
  assert.ok(html.includes('평안한 4/5'))
  assert.ok(!html.includes('4.0/5'))
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
const testUnanalysedId = 'test-unanalysed-work'
const testConcertWorks = { ...concertWorks, [testUnanalysedId]: { id: testUnanalysedId, title: '미등록 교향곡', composer: '베토벤', type: 'symphony', opus: 125, number: 9, trackIds: [] } }
const testConcert = { id: 'test-registered-concert', title: '테스트 등록 공연', programStatus: 'verified', programVerification: 'manual',
  startsAt: '2026-12-24T20:00:00+09:00', endsAt: '2026-12-24T22:00:00+09:00', region: '서울', venue: '테스트홀',
  ticketOpensAt: '2026-10-15T14:00:00+09:00', sourceUrl: 'https://example.com/concert', sourceLabel: '테스트 출처', verifiedOn: '2026-10-12',
  programWorkIds: ['beethoven-piano-concerto-op73-no5', testUnanalysedId] }
test('곡 검색은 한글·영문·별칭·작품번호로 기존 ID만 선택한다', () => {
  const ids = (query) => searchConcertTracks(tracks, query).map(({ id }) => id)
  assert.ok(ids('Chopin Ballade Op.23').includes('chopin-ballade-op23-no1'))
  assert.ok(ids('쇼팽 발라드 1').includes('chopin-ballade-op23-no1'))
  assert.ok(ids('Emperor Beethoven Op.73').includes('beethoven-piano-concerto-op73-no5-m2'))
  assert.ok(ids('Tchaikovsky Four Seasons June Barcarolle').includes('tchaikovsky-seasons-op37a-no6'))
  assert.ok(ids('차이콥스키 사계 10월').includes('tchaikovsky-seasons-op37a-no10'))
  assert.ok(ids('Schubert Impromptu D.899 Op.90 No.3').includes('schubert-impromptu-d899-op90-no3'))
  assert.ok(ids('슈베르트 즉흥곡 4번').includes('schubert-impromptu-d899-op90-no4'))
  assert.ok(!ids('Chopin Ballade Op.28').includes('chopin-ballade-op23-no1'))
  assert.deepEqual(ids('존재하지 않는 작품'), [])
  assert.deepEqual(ids(''), [])
})
test('공연 화면은 곡 선택 전 API를 호출하지 않고 카탈로그에서 실제 곡 ID를 선택한다', async () => {
  await verifyConcertSearchInteractions(components.default)
})
test('느낌·기분의 선택 해제와 탭별 초기화·기분 후보 확대·직전 추천 제외·보관 시 대표곡 유지를 검증한다', async () => {
  await verifyMusicSelectionInteractions(components.default)
})
test('보관한 특정 곡의 캐시 결과·10건 자동 확인·추가 확인·중단·조건 변경·상태 집계를 검증한다', async () => {
  await verifyTargetConcertInteractions(components.default)
})

test('DB preview renders empty, confirmed and error states without OCR calls or inferred movements',async()=>{
  await verifyDbConcertInteractions(components.default)
})
test('검색에 병합된 등록 공연이나 반복 API 행은 카드를 중복 표시하지 않는다', () => {
  const now = Date.parse('2026-10-12T12:00:00+09:00')
  const targetTrack = tracks.find(({ id }) => id === 'beethoven-piano-concerto-op73-no5-m2')
  const workId = 'beethoven-piano-concerto-op73-no5'
  const result = analyzeConcert({ ...testConcert, kopisDetailVerified: true, programVerification: 'text', kopisId: 'PF999111', targetMatch: { targetTrackId: targetTrack.id, workId, evidenceKind: 'text', status: 'matched', reason: '테스트 프로그램 확인' } }, tracks, {}, testConcertWorks)
  const html = render(components.ConcertScreen, { searchResults: [result, result], now, region: '서울', searchControls: { targetTrack, period: { from: '2026-12-01', to: '2026-12-31' }, search: { status: 'success', data: { target: { workId }, targetTrackId: targetTrack.id, concerts: [result.concert], query: { region: '서울', from: '2026-12-01', to: '2026-12-31' }, fetchedAt: new Date(now).toISOString() } } } })
  assert.equal((html.match(/class="concert-card"/g) || []).length, 1)
})
test('공연 카드·전체 프로그램은 공식 링크·확인일·분석 범위·악장 상세·실제 영상 상태를 렌더링한다', () => {
  const now = Date.parse('2026-10-12T12:00:00+09:00')
  const result = analyzeConcert(testConcert, tracks, { mode: 'library', savedTrackIds: ['beethoven-piano-concerto-op73-no5-m2'] }, testConcertWorks)
  const card = render(components.ConcertCard, { result, now })
  assert.ok(card.includes('보관한 2악장'))
  assert.ok(card.includes('분석된 작품 기준'))
  assert.ok(card.includes('예매 오픈 예정'))
  assert.ok(card.includes('2026-10-12'))
  assert.ok(card.includes(`href="${testConcert.sourceUrl}" target="_blank" rel="noopener noreferrer"`))
  const detail = render(components.ConcertDetailScreen, { result, now, details: trackDetails, isTrackSaved: (id) => id.endsWith('-m2') })
  assert.equal((detail.match(/class="concert-work"/g) ?? []).length, 2)
  assert.equal((detail.match(/곡 상세·보관/g) ?? []).length, 3)
  assert.equal((detail.match(/>미리듣기<\/button>/g) ?? []).length, 3)
  assert.ok(detail.includes('아직 분석하지 않은 작품'))
  assert.ok(detail.includes('부드러운 4.5/5'))
  assert.ok(!/세 악장 연주 확정|취향 일치|95%/.test(detail + card))
  const linkedTrack = result.program[0].linkedTracks[1]
  // 악장별 미리듣기 버튼이 각 곡에 연결되는 경로를 검증합니다.
  const withPreview = render(components.ConcertDetailScreen, { result, now, details: { [linkedTrack.id]: { shortPreview: { provider: 'youtube', videoId: 'test-preview' } } } })
  assert.equal((withPreview.match(/>미리듣기<\/button>/g) ?? []).length, 1)
  assert.ok(withPreview.includes('2악장 미리듣기'))
  const screen = render(components.ConcertScreen, { now, region: '서울', tracks, savedTracks: [] })
  assert.equal((screen.match(/class="concert-card"/g) ?? []).length, 0)
  assert.ok(screen.includes('어떤 곡의 공연을 찾으시나요?'))
  assert.ok(!screen.includes('공연 음악 느낌 선택'))
})
test('악장 상세·미리듣기와 공연 상세 버튼은 선택한 실제 곡·공연 ID를 전달한다', () => {
  const result = analyzeConcert(testConcert, tracks, {}, testConcertWorks)
  const buttonsIn = (node) => Array.isArray(node) ? node.flatMap(buttonsIn)
    : !node || typeof node !== 'object' ? [] : [...(node.type === 'button' ? [node] : []), ...buttonsIn(node.props?.children)]
  for (const track of result.program[0].linkedTracks) {
    const clicked = []
    const node = components.ConcertMovement({ work: result.program[0], track,
      detail: { shortPreview: { provider: 'youtube', videoId: 'test-preview' } },
      onOpenTrack: (value) => clicked.push(['detail', value]), onOpenShort: (value) => clicked.push(['preview', value]) })
    const buttons = buttonsIn(node)
    assert.equal(buttons.length, 2)
    buttons.forEach((button) => button.props.onClick())
    assert.deepEqual(clicked, [['detail', track], ['preview', track]])
    const registered = components.ConcertMovement({ work: result.program[0], track, detail: trackDetails[track.id] })
    assert.equal(buttonsIn(registered).length, 2)
  }
  let openedId
  const card = components.ConcertCard({ result, onOpenConcert: (id) => { openedId = id } })
  buttonsIn(card)[0].props.onClick()
  assert.equal(openedId, testConcert.id)
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
    if (track.movement) assert.equal((html.match(new RegExp(track.movement, 'g')) ?? []).length, 1)
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
test('곡 상세는 공연 찾기를 하나만 표시하고 보관한 곡에는 보관함 이동을 제공한다', () => {
  const props = {
    track: tracks[0],
    detail: trackDetails[tracks[0].id],
    selectedKeys: [],
    isOpen: true,
    onToggleSave: () => {},
    onFindTrackConcert: () => {},
    onGoLibrary: () => {},
  }
  const unsaved = render(components.TrackDetailSheet, { ...props, isSaved: false })
  assert.equal((unsaved.match(/이 곡의 공연 찾기/g) ?? []).length, 1)
  assert.ok(!unsaved.includes('이 작품이 포함된 공연 보기'))
  assert.ok(!unsaved.includes('보관함으로 가기'))

  const saved = render(components.TrackDetailSheet, { ...props, isSaved: true })
  assert.equal((saved.match(/이 곡의 공연 찾기/g) ?? []).length, 1)
  assert.ok(saved.includes('보관함으로 가기'))
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
