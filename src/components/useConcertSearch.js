import {useCallback,useEffect,useRef,useState} from 'react'
import {createConcertSearchClient,uniqueConcerts} from '../data/concertSearch.js'
export default function useConcertSearch(){
 const [client]=useState(()=>createConcertSearchClient()),[search,setSearch]=useState({status:'idle',data:null,error:null}),[detail,setDetail]=useState({status:'idle',data:null,error:null})
 const listId=useRef(0),detailId=useRef(0),listAbort=useRef(null),detailAbort=useRef(null),snapshot=useRef(null),busy=useRef(false)
 const runSearch=useCallback(async(query,refresh=false,append=false)=>{
  if(append&&busy.current)return
  listAbort.current?.abort();const controller=new AbortController();listAbort.current=controller;const id=++listId.current;busy.current=true
  const previous=append?snapshot.current:null;setSearch({status:append?'loading-more':'loading',data:previous,error:null})
  try{const data=await client.search(query,{refresh,signal:controller.signal});if(id!==listId.current||controller.signal.aborted)return
   const value={...data,concerts:uniqueConcerts([...(previous?.concerts||[]),...data.concerts])};snapshot.current=value;setSearch({status:'success',data:value,error:null})
  }catch(e){if(id===listId.current&&!controller.signal.aborted)setSearch({status:'error',data:previous,error:e.message})}
  finally{if(id===listId.current)busy.current=false}
 },[client])
 const loadMore=useCallback(()=>{const data=snapshot.current;if(data?.hasMore)return runSearch({...data.query,page:data.page+1},false,true)},[runSearch])
 const loadDetail=useCallback(async(id,refresh=false)=>{
  detailAbort.current?.abort();const controller=new AbortController();detailAbort.current=controller;const token=++detailId.current;setDetail({status:'loading',data:null,error:null,kopisId:id})
  try{const data=await client.detail(id,{refresh,signal:controller.signal});if(token===detailId.current&&!controller.signal.aborted)setDetail({status:'success',data:data.concert,stale:data.stale,fetchedAt:data.fetchedAt,source:data.source,error:null,kopisId:id})}
  catch(e){if(token===detailId.current&&!controller.signal.aborted)setDetail({status:'error',data:null,error:e.message,kopisId:id})}
 },[client])
 useEffect(()=>()=>{listId.current++;detailId.current++;listAbort.current?.abort();detailAbort.current?.abort()},[])
 return {search,detail,runSearch,loadMore,loadDetail}
}
