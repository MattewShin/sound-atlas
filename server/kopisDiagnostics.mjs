import {createHash} from 'node:crypto'

const failures = new WeakMap()
const mediaTypes = new Set(['application/xml','text/xml','text/html','application/json','text/plain'])
const diagnosticLimit = 16_384

// Local diagnostics: no raw response bodies, arbitrary headers or keyed URLs.
const redact = (value, env) => {
  let result = String(value)
  for (const [name, value] of Object.entries(env)) {
    if (!/KEY|SECRET|TOKEN|PASSWORD/i.test(name) || typeof value !== 'string' || !value.trim()) continue
    for (const secret of new Set([value,value.trim(),encodeURIComponent(value.trim()),encodeURIComponent(encodeURIComponent(value.trim()))])) {
      result = result.split(secret).join('[REDACTED]')
    }
  }
  return result.replace(/https?:\/\/[^\s<>"']+/gi,'[REDACTED_URL]')
    .replace(/((?:service|apikey|access_token|token|password|key)\s*[=:]\s*)[^\s&<>"']+/gi,'$1[REDACTED]')
    .replace(/[A-Za-z0-9_%+/=-]{24,}/g,'[REDACTED_TOKEN]').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,240)
}

export const describeKopisResponse = (response, body, env=process.env) => {
  const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
  const base = {http_status:response.status,content_type:mediaTypes.has(type)?type:null}
  if (body == null) return {...base,body_unavailable:true}
  if (Buffer.byteLength(body,'utf8') > diagnosticLimit) return {...base,body_truncated:true}
  let label = body.match(/<(?:errmsg|message|title|h1)\b[^>]*>([\s\S]*?)<\/(?:errmsg|message|title|h1)>/i)?.[1]
  let code = body.match(/<returncode\b[^>]*>\s*([A-Za-z0-9_-]{1,32})\s*<\/returncode>/i)?.[1]
  if (type === 'application/json') {
    try {
      const json = JSON.parse(body)
      label = json?.error?.message ?? json?.message ?? label
      const candidate = json?.error?.code ?? json?.code
      if (/^[A-Za-z0-9_-]{1,32}$/.test(String(candidate ?? ''))) code = String(candidate)
    } catch { /* Invalid JSON remains an invalid response. */ }
  }
  return {...base,body_kind:/^\s*(?:<!doctype\s+html|<html)/i.test(body)?'HTML':/^\s*</.test(body)?'XML':type==='application/json'?'JSON':'OTHER',
    body_fingerprint:createHash('sha256').update(body).digest('hex'),
    ...(code?{upstream_code:redact(code,env)}:{}),
    ...(typeof label==='string'&&label.trim()?{upstream_message:redact(label,env)}:{})}
}

export const readKopisHttpFailure = async (response, env) => {
  let reader
  try {
    reader = response.body?.getReader()
    if (!reader) return describeKopisResponse(response,'',env)
    const chunks=[];let bytes=0
    for (;;) {
      const {done,value}=await reader.read()
      if (done) break
      bytes+=value.byteLength
      if (bytes>diagnosticLimit) {
        // Never log a partial credential cut off at the read boundary.
        return {http_status:response.status,content_type:describeKopisResponse(response,null,env).content_type,body_truncated:true}
      }
      chunks.push(value)
    }
    return describeKopisResponse(response,Buffer.concat(chunks).toString('utf8'),env)
  } catch { return describeKopisResponse(response,null,env) }
  finally { if(reader)await reader.cancel().catch(()=>{}) }
}

export const attachKopisDiagnostic = (error, url, response) => {
  const query={}
  for(const name of ['stdate','eddate','signgucode','shcate','prfstate','cpage','rows']) {
    const value=url.searchParams.get(name)
    if(value!=null)query[name]=/^[A-Z0-9]{1,12}$/.test(value)?value:'[INVALID]'
  }
  failures.set(error,{request:{origin:'https://kopis.or.kr',method:'GET',
    endpoint:/^\/openApi\/restful\/pblprfr(?:\/PF\d{1,12})?$/.test(url.pathname)?url.pathname:'[INVALID]',query},
    ...(response?{response}:{})})
}
export const getKopisDiagnostic = error => failures.get(error)
