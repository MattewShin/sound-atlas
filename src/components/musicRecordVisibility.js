// UI classification only; server visibility and the original/share split stay unchanged.
export const recordMatchesFilter = (publication, filter) => filter === 'all'
  || (filter === 'private' && (!publication || publication.visibility === 'private'))
  || (filter === 'public' && ['followers', 'public'].includes(publication?.visibility))

export const recordVisibilityLabel = publication => !publication ? '나만 보기'
  : ({ private: '나만 보기', followers: '팔로워 공개', public: '전체 공개' })[publication.visibility] ?? '범위 확인 필요'
