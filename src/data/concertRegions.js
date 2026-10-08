export const concertRegions = [
  '전국', '서울', '경기', '인천', '강원', '대전', '세종', '충북', '충남',
  '광주', '전북', '전남', '대구', '경북', '부산', '울산', '경남', '제주',
]
const REGION_STORAGE_KEY = 'classic-atlas-concert-region-v1'
export const readConcertRegion = () => {
  try {
    const region = window.localStorage.getItem(REGION_STORAGE_KEY)
    return concertRegions.includes(region) ? region : '서울'
  } catch {
    return '서울'
  }
}
export const saveConcertRegion = (region) => {
  if (!concertRegions.includes(region)) return
  try { window.localStorage.setItem(REGION_STORAGE_KEY, region) } catch { /* 저장이 차단돼도 현재 선택은 유지합니다. */ }
}
