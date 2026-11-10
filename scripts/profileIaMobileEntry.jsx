import React from 'react'
import { createRoot } from 'react-dom/client'
import App from '../src/App.jsx'
import { profileFixture } from './profileIaFixture.mjs'
import { installTypography } from '../src/data/typography.js'
import { measureRenderedText } from './profileTextMetrics.mjs'
const args = new URLSearchParams(location.search)
const fixture = profileFixture({ signedIn: !args.has('guest'), needsSetup: args.has('setup') })
fixture.profile.handle = 'very_long_piano_handle_24'
window.fixture = fixture
window.measureRenderedText = measureRenderedText
installTypography()
createRoot(document.getElementById('root')).render(<App authClient={fixture.db} socialApi={fixture.api} />)
