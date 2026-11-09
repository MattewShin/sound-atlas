const order=(a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b))
export const canonicalIdentityJson=value=>{
  if(Array.isArray(value))return '['+value.map(canonicalIdentityJson).join(',')+']'
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort(order).map(k=>JSON.stringify(k)+':'+canonicalIdentityJson(value[k])).join(',')+'}'
  return JSON.stringify(value)
}
