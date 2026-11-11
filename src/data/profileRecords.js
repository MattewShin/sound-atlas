import { listMyMusicShares } from './musicSharing.js'
import { JOURNAL_PAGE_SIZE } from './musicJournal.js'

const fields = 'id,track_id,kind,body,recorded_on,revision,created_at,updated_at'
export const publicSourceIds = shares => [...new Set(shares.filter(s => ['followers','public'].includes(s.visibility)).map(s => s.source_record_id))]

// Existing owner-only metadata RPC is complete: publication quota and RPC cap
// are both 100. No publication bodies or global feed are needed for these counts.
export async function readRecordSummary(client, userId) {
  const [recent, shares] = await Promise.all([
    client.from('user_music_journal').select('id,track_id,kind,body,recorded_on', { count:'exact' }).eq('user_id',userId)
      .order('recorded_on',{ascending:false}).order('created_at',{ascending:false}).order('id',{ascending:false}).range(0,2),
    listMyMusicShares(client,userId),
  ])
  if (recent.error) throw recent.error
  const total = recent.count ?? 0, published = publicSourceIds(shares).length
  if (published > total) throw new Error('SUMMARY_CHANGED_RETRY')
  return { total, private:total-published, public:published, recent:recent.data ?? [] }
}

export async function listProfileRecordPage(client,userId,{filter='all',page=0,shares=[]}={}) {
  if (!['all','private','public'].includes(filter) || !Number.isInteger(page) || page<0) throw new Error('INVALID_RECORD_FILTER')
  const ids=publicSourceIds(shares)
  if (filter==='public'&&!ids.length) return {records:[],total:0}
  let query=client.from('user_music_journal').select(fields,{count:'exact'}).eq('user_id',userId)
  if (filter==='public') query=query.in('id',ids)
  else if (filter==='private'&&ids.length) query=query.not('id','in','('+ids.map(id=>JSON.stringify(id)).join(',')+')')
  const {data,error,count}=await query.order('recorded_on',{ascending:false}).order('created_at',{ascending:false}).order('id',{ascending:false})
    .range(page*JOURNAL_PAGE_SIZE,(page+1)*JOURNAL_PAGE_SIZE-1)
  if (error) throw error
  return {records:data??[],total:count??0}
}
