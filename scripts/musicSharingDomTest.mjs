import assert from 'node:assert/strict'
import React from 'react'
import { JSDOM } from 'jsdom'
import { tracks } from '../src/data/musicData.js'

export async function verifyMusicSharing(components) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://example.test/?code=must-not-share' })
  const names = ['window','document','navigator','HTMLElement','IS_REACT_ACT_ENVIRONMENT']
  const original = new Map(names.map((name) => [name,Object.getOwnPropertyDescriptor(globalThis,name)]))
  for (const name of ['window','document','navigator','HTMLElement']) Object.defineProperty(globalThis,name,{ value: name === 'window' ? dom.window : dom.window[name], configurable:true,writable:true })
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const doc = dom.window.document, id = tracks[0].id
  const records = Array.from({ length: 11 }, (_, i) => ({ id: `record-${i}`,track_id:i === 0 ? id : tracks[1].id,kind:'reflection',body:`비공개 원본 ${i}`,recorded_on:'2026-11-02',revision:1 }))
  const publications = [], nicknames = new Map()
  let writes = 0, lastPublicationArgs, openedTrack, root, failPublish = true
  const client = {
    channel() { const c = { on() { return c }, subscribe(fn) { fn('SUBSCRIBED'); return c } }; return c },
    async removeChannel() {},
    from(table) {
      const filters = {}
      const query = { select() { return query },eq(key,value) { filters[key] = value; return query },order() { return query },
        async range(start,end) {
          const rows = table === 'user_music_journal' ? (filters.user_id === 'user-a' ? records.filter((r) => !filters.track_id || r.track_id === filters.track_id) : []) : publications.filter((p) => p.track_id === filters.track_id)
          return { data:rows.slice(start,end+1),count:rows.length }
        },
        async maybeSingle() { return { data:table === 'user_music_nicknames' ? (nicknames.has(filters.user_id) ? { nickname:nicknames.get(filters.user_id) } : null) : publications.find((p) => p.id === filters.id) || null } },
      }
      return query
    },
    async rpc(name,args) {
      if (name === 'list_my_music_shares') return { data:publications.filter((p) => p.testOwner === args.p_owner_id).map((p) => ({ id:p.id,source_record_id:p.testRecord,published_at:p.published_at })) }
      writes += 1
      if (name === 'social_publish_record') {
        lastPublicationArgs = args
        if (failPublish) return { error:{ code:'NETWORK' } }
        const source = records.find((r) => r.id === args.p_record_id)
        publications.push({ id:args.p_id,track_id:source.track_id,nickname:args.p_nickname,body:args.p_body,kind:source.kind,recorded_on:source.recorded_on,published_at:'2026-11-02T06:00:00Z',testOwner:args.p_owner_id,testRecord:source.id })
        nicknames.set(args.p_owner_id,args.p_nickname)
        return { data:args.p_id }
      }
      if (name === 'withdraw_music_record') { publications.splice(publications.findIndex((p) => p.id === args.p_id),1); return { data:true } }
      throw new Error('Unexpected RPC')
    },
  }
  const button = (label) => [...doc.querySelectorAll('button')].find((node) => node.textContent.trim() === label)
  const flush = async (action) => React.act(async () => { action?.(); await new Promise((resolve) => setTimeout(resolve,0)) })
  const input = async (element,value) => flush(() => {
    const prototype = element.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,value)
    element.dispatchEvent(new dom.window.Event('input',{ bubbles:true })); element.dispatchEvent(new dom.window.Event('change',{ bubbles:true }))
  })
  const renderRecords = (user = 'user-a') => root.render(React.createElement(components.MyMusicRecords,{ auth:{ user:user ? { id:user } : null },client,onOpenTrack:(track) => { openedTrack = track.id } }))
  try {
    const { createRoot } = await import('react-dom/client')
    root = createRoot(doc.getElementById('root'))
    await flush(() => renderRecords(null))
    assert.ok(doc.body.textContent.includes('Google로 로그인'))
    await flush(() => renderRecords())
    assert.equal(doc.querySelectorAll('.music-journal-entry').length,10)
    await flush(() => doc.querySelector('.music-journal-track-title button').click())
    assert.equal(openedTrack,id)
    await flush(() => button('기록 더 보기').click())
    assert.equal(doc.querySelectorAll('.music-journal-entry').length,11)
    await flush(() => button('선택한 기록 공유').click())
    await input(doc.querySelector('.music-share-editor input[type="text"]'),'피아노산책')
    await input(doc.querySelector('.music-share-editor textarea'),'<script>not-code</script> 공개할 내용만')
    const preview = () => doc.querySelector('.music-share-editor form').dispatchEvent(new dom.window.Event('submit',{ bubbles:true,cancelable:true }))
    await flush(preview)
    assert.equal(writes,0,'preview never writes')
    assert.equal(button('이 내용으로 공유').disabled,true)
    assert.ok(doc.querySelector('.music-share-preview').textContent.includes('공개할 내용만'))
    assert.equal(doc.querySelector('.music-share-preview script'),null)
    await flush(() => doc.querySelector('.music-share-consent input').click())
    await flush(() => button('내용 다시 편집').click())
    await flush(preview)
    assert.equal(doc.querySelector('.music-share-consent input').checked,false,'revised preview requires renewed consent')
    await flush(() => doc.querySelector('.music-share-consent input').click())
    await flush(() => button('이 내용으로 공유').click())
    assert.equal(publications.length,0)
    assert.ok(doc.querySelector('.music-share-preview').textContent.includes('공개할 내용만'),'failed publication keeps preview')
    const attemptedId = lastPublicationArgs.p_id
    failPublish = false
    await flush(() => { button('이 내용으로 공유').click(); button('이 내용으로 공유').click() })
    assert.equal(writes,2,'double click submits once')
    assert.equal(lastPublicationArgs.p_id,attemptedId,'retry uses same id')
    assert.equal(lastPublicationArgs.p_visibility,'private','new share defaults to private')
    assert.equal(publications.length,1)
    assert.equal(records[0].body,'비공개 원본 0')
    assert.equal(doc.querySelector('.music-share-editor'),null)
    const link = doc.querySelector('.music-shared-status a')
    assert.ok(link.href.includes('?story=')); assert.ok(!link.href.includes('code='))
    await flush(() => button('공유 취소').click())
    const before = writes
    await flush(() => button('취소').click())
    assert.equal(writes,before)
    await flush(() => button('공유 취소').click())
    await flush(() => button('공유 취소 확정').click())
    assert.equal(publications.length,0)
    assert.equal(records[0].body,'비공개 원본 0','withdraw keeps private original')
    await flush(() => renderRecords('user-b'))
    assert.ok(!doc.body.textContent.includes('비공개 원본 0'))
    await flush(() => root.render(React.createElement(components.PublicStoryScreen,{ id:attemptedId,client,onBack() {} })))
    assert.ok(doc.body.textContent.includes('열람 권한이 없거나 공유가 취소된 글'))
    assert.equal(dom.window.localStorage.length,0)
  } finally {
    if (root) await flush(() => root.unmount())
    dom.window.close()
    for (const [name,descriptor] of original) { if (descriptor) Object.defineProperty(globalThis,name,descriptor); else delete globalThis[name] }
  }
}
