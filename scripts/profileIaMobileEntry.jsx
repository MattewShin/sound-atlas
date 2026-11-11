import React from 'react'
import { createRoot } from 'react-dom/client'
import App from '../src/App.jsx'
import { profileFixture } from './profileIaFixture.mjs'
import { installTypography } from '../src/data/typography.js'
import { measureRenderedText } from './profileTextMetrics.mjs'
const args = new URLSearchParams(location.search)
const fixture = profileFixture({ signedIn: !args.has('guest'), needsSetup: args.has('setup'), recordCount:args.has('empty') ? 0 : 11 })
fixture.profile.handle = 'very_long_piano_handle_24'
if(args.has('taste'))fixture.state.libraryRows=[{track_id:fixture.state.records[0].track_id,listen_again:true,updated_at:'2026-11-10T00:00:00Z'}]
fixture.profile.nickname = '아주긴합성음악산책닉네임입니다'
if(args.has('empty'))fixture.state.shares=[]
else fixture.state.records[0].body='긴 합성 기록입니다. '.repeat(35)+'\n줄바꿈도 보존해요.'
window.fixture = fixture
window.measureRenderedText = measureRenderedText
installTypography()
createRoot(document.getElementById('root')).render(<App authClient={fixture.db} socialApi={fixture.api} />)
