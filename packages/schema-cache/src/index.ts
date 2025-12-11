// Simple schema cache using localStorage with TTL
const PREFIX = 'schemacache:'
export async function getCachedSchema(key: string){
  const raw = localStorage.getItem(PREFIX + key)
  if(!raw) return null
  try {
    const obj = JSON.parse(raw)
    if(obj.expiresAt && Date.now() > obj.expiresAt){ localStorage.removeItem(PREFIX+key); return null }
    return obj.schema
  } catch(e){ return null }
}

export async function setCachedSchema(key: string, schema:any, ttlMs = 1000*60*60){
  const obj = { schema, expiresAt: Date.now() + ttlMs }
  localStorage.setItem(PREFIX + key, JSON.stringify(obj))
}

export function makeCacheKey(connId: string, db?:string, schemaName?:string){
  return `${connId}::${db||''}::${schemaName||''}`
}
