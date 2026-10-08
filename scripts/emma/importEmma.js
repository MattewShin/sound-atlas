import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateEmmaCsv } from './emmaCsv.js'

const path = process.argv[2]
if (!path) throw new Error('사용법: npm run import:emma -- <EMMA CSV 경로>')
const result = validateEmmaCsv(readFileSync(path), path)
const output = resolve('data/emma')
writeFileSync(resolve(output, 'emmaReference.json'), JSON.stringify({
  source: result.source, counts: result.counts,
  purpose: 'EMMA 원본 참고 자료. 활성 수동 평가·곡 매칭·추천과 연결하지 않음.',
  scoreInterpretation: '특정 연주의 발췌 구간에 대한 EMMA 원점수. manual 1~5와 다른 척도.',
  entries: result.records,
}, null, 2) + '\n')
writeFileSync(resolve(output, 'importErrors.json'), JSON.stringify({ source: result.source, counts: result.counts, errors: result.errors }, null, 2) + '\n')
console.log(`EMMA 참고 자료: 전체 ${result.counts.dataRows}, 정상 ${result.counts.validRows}, 오류 ${result.counts.errorRows}. 앱 점수는 변경하지 않았습니다.`)
