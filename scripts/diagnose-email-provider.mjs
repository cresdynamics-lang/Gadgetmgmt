// Read-only provider diagnostics. Never print API keys, provider IDs or messages.
for(const name of ['EMAIL_FROM','MAIL_FROM','MAIL_FROM_ACCOUNTS']){
 const value=process.env[name]?.trim()||'';const address=value.match(/<([^>]+)>/)?.[1]||value;
 console.log(JSON.stringify({setting:name,configured:Boolean(value),senderDomain:address.includes('@')?address.split('@').pop():null}));
}
for(const name of ['RESEND_API_KEY','RESEND_API_KEY_ACCOUNTS']){
 const key=process.env[name];if(!key){console.log(JSON.stringify({setting:name,configured:false}));continue;}
 try{const response=await fetch('https://api.resend.com/domains',{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(15000)});const body=await response.json();
 console.log(JSON.stringify({setting:name,configured:true,status:response.status,errorType:typeof body.name==='string'?body.name:null,domains:Array.isArray(body.data)?body.data.map(row=>({name:row.name,status:row.status})):[]}));
 }catch{console.log(JSON.stringify({setting:name,configured:true,requestFailed:true}));}
}
