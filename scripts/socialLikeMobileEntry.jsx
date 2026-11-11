import React from 'react'
import {createRoot} from 'react-dom/client'
import MusicSocial from '../src/components/MusicSocial.jsx'
import {installTypography} from '../src/data/typography.js'
const profile={id:'fixture-public-author',handle:'synthetic_music_listener',nickname:'개인정보 없는 합성 음악가'},me={id:'fixture-public-reader',handle:'synthetic_reader',nickname:'합성 독자'}
const posts=Array.from({length:65},(_,i)=>({id:'fixture-post-'+i,profile,track_id:'chopin-etude-op10-no1',body:'실제 사용자 자료가 아닌 합성 음악 감상입니다.\n'.repeat(36),created_at:new Date(Date.UTC(2026,10,11,0,0,-i)).toISOString(),visibility:'public',liked:false,like_count:0,comment_count:0}))
let event,fail=false,calls=0
const api={subscribe(fn,s){event=fn;s('SUBSCRIBED');return()=>{}},me:async()=>me,comments:async()=>[],profile:async()=>profile,feed:async(route,cursor)=>{await new Promise(r=>setTimeout(r,60));return structuredClone(route.post?posts.filter(p=>p.id===route.post):posts.slice(cursor?posts.findIndex(p=>p.id===cursor.id)+1:0,(cursor?posts.findIndex(p=>p.id===cursor.id)+1:0)+30))},like:async(id,desired)=>{calls++;await new Promise(r=>setTimeout(r,450));if(fail){fail=false;throw Error('합성 네트워크 오류')}const p=posts.find(p=>p.id===id);p.liked=desired;p.like_count=desired?1:0;event({kind:'like'})}}
window.likeFixture={invalidate:payload=>event(payload),failNext:()=>{fail=true},calls:()=>calls}
installTypography();createRoot(document.getElementById('root')).render(<MusicSocial api={api} auth={{user:{id:'fixture-auth-reader'}}}/>);
