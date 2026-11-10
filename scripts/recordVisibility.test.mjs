import test from 'node:test'
import assert from 'node:assert/strict'
import { recordMatchesFilter, recordVisibilityLabel } from '../src/components/musicRecordVisibility.js'

test('내 기록의 나만 보기/공개 중 분류는 배타적이며 private 공유본도 나만 보기다', () => {
  for (const [publication, category, label] of [
    [undefined, 'private', '나만 보기'],
    [{ visibility: 'private' }, 'private', '나만 보기'],
    [{ visibility: 'followers' }, 'public', '팔로워 공개'],
    [{ visibility: 'public' }, 'public', '전체 공개'],
  ]) {
    assert.equal(recordMatchesFilter(publication,'all'),true)
    assert.equal(recordMatchesFilter(publication,category),true)
    assert.equal(recordMatchesFilter(publication,category === 'private' ? 'public' : 'private'),false)
    assert.equal(Number(recordMatchesFilter(publication,'private')) + Number(recordMatchesFilter(publication,'public')),1)
    assert.equal(recordVisibilityLabel(publication),label)
  }
  assert.equal(recordMatchesFilter({visibility:'unknown'},'public'),false)
  assert.equal(recordVisibilityLabel({visibility:'unknown'}),'범위 확인 필요')
})
