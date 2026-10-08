import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { emotions, formatTrackTitle } from '../src/data/emotions.js'
import { tracks } from '../src/data/musicData.js'
import { getRecommendationResult } from '../src/data/recommendations.js'

export const buildRecommendationDiagnosis = (trackList = tracks) => ({
  trackCount: trackList.length,
  emotions: emotions.map(({ key, label }) => {
    const result = getRecommendationResult(trackList, [key])
    return { key, label, candidateCount: result.tracks.length,
      topTracks: result.tracks.slice(0, 3).map((track) => ({ id: track.id, title: formatTrackTitle(track), score: track.emotionScores[key] })) }
  }),
})
export const formatRecommendationDiagnosis = (report) => [
  `Classic Atlas 수동 감정 평가 추천 진단 · ${report.trackCount}곡`,
  ...report.emotions.flatMap(({ label, candidateCount, topTracks }) => [
    `${label}: ${candidateCount}곡`, ...topTracks.map(({ title, score }) => `  ${title}: ${score}`),
  ]),
].join('\n')
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(process.argv.includes('--json') ? JSON.stringify(buildRecommendationDiagnosis(), null, 2) : formatRecommendationDiagnosis(buildRecommendationDiagnosis()))
}
