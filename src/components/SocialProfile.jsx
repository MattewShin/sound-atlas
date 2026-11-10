import React, { useEffect, useState } from 'react'

export function Avatar({ profile }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [profile?.avatar_url])
  return profile?.avatar_url && !failed ? <img className="social-avatar" src={profile.avatar_url} referrerPolicy="no-referrer" alt="" onError={() => setFailed(true)} /> : <span className="social-avatar" aria-hidden="true">♪</span>
}

export function ProfileEditor({ profile, nicknameHint = '', save, pending }) {
  const [handle, setHandle] = useState(profile?.handle ?? '')
  const [nickname, setNickname] = useState(profile?.nickname ?? nicknameHint)
  const [avatar, setAvatar] = useState(profile?.avatar_url ?? '')
  return <form className="social-form" onSubmit={e => { e.preventDefault(); void save({ handle: handle.toLowerCase(), nickname: nickname.trim(), avatar_url: avatar.trim() || null }) }}>
    <h2>공개 프로필 {profile ? '수정' : '만들기'}</h2><p>직접 입력한 닉네임과 아이디만 표시해요. Google 이름·이메일은 공개하지 않아요.</p>
    <label>@아이디<input required pattern="[a-z][a-z0-9_]{2,23}" minLength={3} maxLength={24} value={handle} onChange={e => setHandle(e.target.value.toLowerCase())} autoComplete="off" /><small>영문 소문자로 시작, 영문·숫자·밑줄 3~24자</small></label>
    <label>공개 닉네임<input required maxLength={20} disabled={Boolean(profile || nicknameHint)} value={nickname} onChange={e => setNickname(e.target.value)} /><small>기존에 정한 공개 닉네임은 그대로 사용해요.</small></label>
    <label>프로필 이미지 URL (선택)<input type="url" pattern="https://.*" value={avatar} onChange={e => setAvatar(e.target.value)} placeholder="https://" /></label>
    <button disabled={pending} type="submit">프로필 저장</button>
  </form>
}
