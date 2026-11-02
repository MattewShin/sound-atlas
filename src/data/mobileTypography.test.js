import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
const hex = (value) => value.match(/[\da-f]{2}/gi).map((part) => Number.parseInt(part, 16) / 255)
const luminance = (value) => {
  const [red, green, blue] = hex(value).map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return red * 0.2126 + green * 0.7152 + blue * 0.0722
}
const contrast = (foreground, background) => {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

test('모바일 공통 글자 변수는 본문 16px·보조정보 14px·캡션 13px 이상을 사용한다', () => {
  for (const declaration of [
    '--font-body: 16px', '--font-small: 14px', '--font-caption: 13px', '--font-button: 15px',
    '--font-card-title: 18px', '--font-section-title: 21px', '--font-page-title: 25px',
  ]) assert.ok(css.includes(declaration), declaration)
  assert.match(css, /\.concert-period input,[\s\S]*?font-size:\s*16px/)
  assert.match(css, /\.app-shell button,[\s\S]*?min-height:\s*44px/)
})

test('긴 곡명·공연명은 모바일에서 말줄임 없이 줄바꿈하고 하단 내비게이션 안전 여백을 둔다', () => {
  assert.match(css, /\.mini-copy b \{[^}]*white-space:\s*normal[^}]*text-overflow:\s*clip/s)
  assert.match(css, /\.track-copy h2 \{[^}]*overflow-wrap:\s*anywhere/s)
  assert.match(css, /\.concert-card h2 \{[^}]*overflow-wrap:\s*anywhere/s)
  assert.match(css, /\.app-shell \{[^}]*padding-bottom:\s*calc\(124px \+ env\(safe-area-inset-bottom\)\)/s)
  assert.match(css, /\.nav-item \{[^}]*min-height:\s*58px/s)
})

test('공연 검색 날짜 입력은 iPhone에서도 패널을 넘지 않고 공연명 입력과 같은 크기를 사용한다', () => {
  assert.match(css, /\.concert-search-panel \{[^}]*min-width:\s*0[^}]*overflow:\s*hidden/s)
  assert.match(css, /\.concert-search-panel form,[^\{]*\{[^}]*width:\s*100%[^}]*min-width:\s*0[^}]*max-width:\s*100%/s)
  assert.match(css, /\.concert-period \{[^}]*width:\s*100%[^}]*min-width:\s*0[^}]*max-width:\s*100%/s)
  assert.match(css, /\.concert-period input \{[^}]*inline-size:\s*100%[^}]*min-inline-size:\s*0[^}]*max-inline-size:\s*100%/s)
  assert.match(css, /\.concert-keyword input, \.concert-period input \{[^}]*block-size:\s*46px[^}]*height:\s*46px[^}]*min-height:\s*46px/s)
  assert.match(css, /\.concert-keyword input, \.concert-period input \{[^}]*-webkit-appearance:\s*none[^}]*appearance:\s*none/s)
  assert.match(css, /\.concert-period input::\-webkit-date-and-time-value \{[^}]*min-height:\s*24px[^}]*text-align:\s*left/s)
})

test('느낌·기분 키워드는 선택 체크와 무관하게 박스 정중앙에 배치된다', () => {
  assert.match(css, /\.keyword-choice-list button \{[^}]*display:\s*grid[^}]*place-items:\s*center[^}]*padding:\s*8px 22px/s)
  assert.match(css, /\.feeling-choice-list button,[^\{]*\{[^}]*display:\s*grid[^}]*place-items:\s*center[^}]*padding:\s*8px 22px/s)
  assert.match(css, /\.keyword-choice-list button\.selected::after \{[^}]*position:\s*absolute[^}]*right:\s*7px/s)
})

test('두 줄 키워드는 같은 가로줄의 다른 버튼 높이를 늘리지 않는다', () => {
  assert.match(css, /\.keyword-choice-list \{[^}]*align-items:\s*start/s)
  assert.match(css, /\.feeling-choice-list \{[^}]*align-items:\s*start/s)
})

test('주요 모바일 텍스트 색상은 밝은 기본 배경에서 WCAG AA 4.5:1 이상이다', () => {
  for (const color of ['#263b36', '#53635b', '#667269']) {
    assert.ok(contrast(color, '#f7f3eb') >= 4.5, `${color}: ${contrast(color, '#f7f3eb').toFixed(2)}`)
  }
  assert.ok(contrast('#fffaf0', '#245a53') >= 4.5)
})

