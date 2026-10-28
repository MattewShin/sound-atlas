import sharp from 'sharp'
import {createHash} from 'node:crypto'
import {kopisImageUrl,readLimitedImageBytes} from './kopisImageSource.mjs'
import {OCR_FALLBACK_RULE,OCR_FALLBACK_QUALITY as t} from './ocrFallback.mjs'
const error=code=>Object.assign(new Error(code),{code})
// Exactly one GET, no transport retry or redirect request. Limits cannot be relaxed by env.
export async function downloadFallbackImage(url,{fetchImpl=fetch,signal}={}){
  const timeout=AbortSignal.timeout(10000),combined=signal?AbortSignal.any([signal,timeout]):timeout
  const response=await fetchImpl(kopisImageUrl(url),{method:'GET',redirect:'error',signal:combined})
  if(!response.ok)throw error('OCR_IMAGE_HTTP_FAILED')
  const mime=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()
  if(!['image/jpeg','image/png','image/webp'].includes(mime))throw error('OCR_IMAGE_MIME_INVALID')
  const raw=await readLimitedImageBytes(response,t.maxBytes),contentHash=createHash('sha256').update(raw).digest('hex')
  try{
    const metadata=await sharp(raw,{limitInputPixels:t.maxPixels}).metadata()
    if(!metadata.width||!metadata.height||metadata.pages>1||metadata.width>t.maxDimension||metadata.height>t.maxDimension||metadata.width*metadata.height>t.maxPixels)throw error('OCR_IMAGE_LIMIT_EXCEEDED')
    if(!({jpeg:'image/jpeg',png:'image/png',webp:'image/webp'}[metadata.format]===mime))throw error('OCR_IMAGE_MIME_INVALID')
    const decoded=await sharp(raw,{limitInputPixels:t.maxPixels}).rotate().removeAlpha().png().toBuffer({resolveWithObject:true})
    const {data,info}=await sharp(decoded.data).greyscale().resize({width:1000,height:1000,fit:'inside',withoutEnlargement:true}).raw().toBuffer({resolveWithObject:true})
    let count=0,sum=0,sq=0
    for(let y=1;y<info.height-1;y++)for(let x=1;x<info.width-1;x++){const i=y*info.width+x,v=data[i-1]+data[i+1]+data[i-info.width]+data[i+info.width]-4*data[i];sum+=v;sq+=v*v;count++}
    const variance=count?sq/count-(sum/count)**2:0
    return {buffer:decoded.data,contentHash,width:decoded.info.width,height:decoded.info.height,quality:{schema:OCR_FALLBACK_RULE,decoded:true,content_hash:contentHash,mime,bytes:raw.length,original_width:metadata.width,original_height:metadata.height,laplacian_variance:variance}}
  }catch(e){if(e.code?.startsWith('OCR_'))throw e;throw error('OCR_IMAGE_DECODE_FAILED')}
}
