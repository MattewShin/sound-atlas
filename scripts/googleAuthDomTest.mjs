import assert from 'node:assert/strict'
import React from 'react'
import { JSDOM } from 'jsdom'
import useGoogleAuth from '../src/components/useGoogleAuth.js'

export async function verifyGoogleAuthInteractions() {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://sound-atlas.vercel.app/' })
  const names = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT']
  const original = new Map(names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  for (const name of ['window', 'document', 'navigator', 'HTMLElement']) Object.defineProperty(globalThis, name, { value: name === 'window' ? dom.window : dom.window[name], configurable: true, writable: true })
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  let listener
  let oauthOptions
  let signOutCount = 0
  const client = { auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: (callback) => { listener = callback; return { data: { subscription: { unsubscribe() {} } } } },
    signInWithOAuth: async (options) => { oauthOptions = options; return { error: null } },
    signOut: async () => { signOutCount += 1; listener('SIGNED_OUT', null); return { error: null } },
  } }
  const Harness = () => {
    const auth = useGoogleAuth(client)
    return React.createElement('div', null,
      React.createElement('span', { id: 'state' }, auth.user?.email || (auth.isLoading ? 'loading' : 'guest')),
      React.createElement('button', { id: 'login', onClick: auth.signInWithGoogle }, 'login'),
      React.createElement('button', { id: 'logout', onClick: auth.signOut }, 'logout'))
  }
  let root
  const flush = async (action) => React.act(async () => { action?.(); await new Promise((resolve) => setTimeout(resolve, 0)) })
  try {
    const { createRoot } = await import('react-dom/client')
    root = createRoot(dom.window.document.getElementById('root'))
    await flush(() => root.render(React.createElement(Harness)))
    assert.equal(dom.window.document.getElementById('state').textContent, 'guest')
    await flush(() => dom.window.document.getElementById('login').click())
    assert.equal(oauthOptions.provider, 'google')
    assert.equal(oauthOptions.options.redirectTo, 'https://sound-atlas.vercel.app/')
    assert.equal(oauthOptions.options.skipBrowserRedirect, false)
    await flush(() => listener('SIGNED_IN', { user: { id: 'user-a', email: 'listener@example.com' } }))
    assert.equal(dom.window.document.getElementById('state').textContent, 'listener@example.com')
    await flush(() => dom.window.document.getElementById('logout').click())
    assert.equal(signOutCount, 1)
    assert.equal(dom.window.document.getElementById('state').textContent, 'guest')
  } finally {
    if (root) await flush(() => root.unmount())
    dom.window.close()
    for (const [name, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name] }
  }
}
