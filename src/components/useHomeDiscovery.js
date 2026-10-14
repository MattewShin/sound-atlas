import { useEffect, useState } from 'react'
import { readDiscoveryIds, saveDiscoveryIds, selectDiscoveryTracks } from '../data/homeDiscovery.js'

export default function useHomeDiscovery({ candidates, activeView, conditionKey, enabled, isLoggedIn }) {
  const [selection, setSelection] = useState(() => ({
    activeView, conditionKey, enabled, isLoggedIn,
    tracks: selectDiscoveryTracks(candidates, readDiscoveryIds()), revision: 1,
  }))
  let current = selection
  if (selection.activeView !== activeView || selection.conditionKey !== conditionKey
    || selection.enabled !== enabled || selection.isLoggedIn !== isLoggedIn) {
    const redraw = activeView === 'explore' && enabled && (selection.activeView !== 'explore'
      || selection.conditionKey !== conditionKey || !selection.enabled || (!selection.isLoggedIn && isLoggedIn))
    current = {
      activeView, conditionKey, enabled, isLoggedIn,
      tracks: redraw ? selectDiscoveryTracks(candidates, selection.tracks.map(({ id }) => id)) : selection.tracks,
      revision: selection.revision + (redraw ? 1 : 0),
    }
    // 같은 컴포넌트의 조건 변경을 렌더 도중 반영해, 이전 카드가 먼저 그려지는 깜빡임을 막습니다.
    // 홈 진입과 로그인 전환은 하나의 변경으로 처리하며 StrictMode의 effect 재실행으로 재추첨하지 않습니다.
    setSelection(current)
  }
  useEffect(() => { saveDiscoveryIds(selection.tracks.map(({ id }) => id)) }, [selection.tracks])
  return current
}
