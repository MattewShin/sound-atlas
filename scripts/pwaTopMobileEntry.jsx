import React from 'react'
import {createRoot} from 'react-dom/client'
import App from '../src/App.jsx'
import {profileFixture} from './profileIaFixture.mjs'
import {installTypography} from '../src/data/typography.js'

// Synthetic transport only. Do not reuse a personal browser/session or screenshot.
const fixture=profileFixture()
const session=fixture.db.auth.getSession
fixture.db.auth.getSession=async()=>{const result=await session();const user=result.data.session?.user;if(user){delete user.email;user.user_metadata={}}return result}
installTypography()
createRoot(document.getElementById('root')).render(<App authClient={fixture.db} socialApi={fixture.api}/>)
