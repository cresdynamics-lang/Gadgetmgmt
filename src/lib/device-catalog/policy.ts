export const CATALOG_MIN_GAP_MS=60000;
export const CATALOG_DAILY_REQUEST_LIMIT=60;
export const CATALOG_MAX_BYTES=8*1024*1024;
export function retryAfterAt(header:string|null,now:number):number|null {
  if(!header)return null;
  if(/^\d+(?:\.\d+)?$/.test(header.trim())){const value=now+Number(header)*1000;return Number.isFinite(value)&&value<=8.64e15?value:null;}
  const date=Date.parse(header);return Number.isFinite(date)?Math.max(now,date):null;
}
export function nextFailureAt(status:number|null,retryAfter:string|null,failures:number,now:number,jitter=0){
  const backoff=Math.min(86400000,300000*2**Math.min(Math.max(failures,0),9));
  const minimum=[401,403].includes(status??0)?86400000:backoff;
  return new Date(Math.max(now+minimum,retryAfterAt(retryAfter,now)??0)+Math.max(0,jitter));
}
export async function boundedJson(response:Response){
  if(Number(response.headers.get("content-length"))>CATALOG_MAX_BYTES)throw new Error("Source response exceeded the size limit.");
  const type=response.headers.get("content-type")??"";
  if(!type.includes("json"))throw new Error("Source returned a non-JSON response; no data was imported.");
  if(!response.body)throw new Error("Source returned no data.");
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let bytes=0;
  try{for(;;){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>CATALOG_MAX_BYTES)throw new Error("Source response exceeded the size limit.");chunks.push(chunk.value);}}finally{await reader.cancel().catch(()=>{});}
  const data=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength;}return JSON.parse(new TextDecoder().decode(data)) as unknown;
}
