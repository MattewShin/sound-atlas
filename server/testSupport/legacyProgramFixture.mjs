import {hashJson} from '../programAnalysis.mjs'

// Historical SQL fixture only; production generators and write adapters stay v4.
export function legacyAnalysisFixture(analysis,version='stored-program-3'){
  const {payload_hash,...body}=structuredClone(analysis)
  body.matcher_version=version
  body.candidates=body.candidates.map(c=>({...c,generation_version:version}))
  return {...body,payload_hash:hashJson(body)}
}
export const legacyRematchFixture=candidate=>({...structuredClone(candidate),generation_version:'stored-program-3'})
