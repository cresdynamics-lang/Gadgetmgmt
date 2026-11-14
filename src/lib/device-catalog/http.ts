import { request } from "node:https";
import { Readable } from "node:stream";
import { createBrotliDecompress, createGunzip } from "node:zlib";

// Fixed-origin API GETs only. IPv4 avoids failed IPv6/Happy-Eyeballs connects on IPv4-only hosts.
// TLS verification stays enabled; redirects, proxies, cookies and IP rotation are not used.
export const catalogFetch:typeof fetch=async(input,init)=>{
  const url=new URL(input instanceof Request?input.url:String(input));
  if(url.protocol!=="https:"||url.username||url.password||init?.method&&init.method!=="GET")throw new Error("Catalog transport only accepts public HTTPS GET requests.");
  return new Promise<Response>((resolve,reject)=>{
    const req=request(url,{family:4,method:"GET",headers:Object.fromEntries(new Headers(init?.headers).entries()),signal:init?.signal??undefined},res=>{
      const headers=new Headers();for(const [key,value]of Object.entries(res.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(", "):value);
      const status=res.statusCode??502;
      if([204,205,304].includes(status)){res.resume();resolve(new Response(null,{status,headers}));return;}
      let stream:Readable=res;
      if(res.headers["content-encoding"]==="gzip")stream=res.pipe(createGunzip());
      else if(res.headers["content-encoding"]==="br")stream=res.pipe(createBrotliDecompress());
      res.on("error",error=>stream.destroy(error));
      resolve(new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>,{status,headers}));
    });
    req.on("error",reject);req.end();
  });
};
