"use client";
import { useCallback, useEffect, useRef, useState, cloneElement, isValidElement, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { operationLabels, nextOperationState, type OperationKind, type OperationUpdate } from "@/lib/operations";

type Unit={id:string;imei:string|null;serialNumber:string|null;status:string;saleItem:{saleId:string}|null;product:{name:string;sku:string}};
type RecordRow={id:string;kind:OperationKind;partnerDirection:string;status:string;version:number;party:string;contact:string|null;destination:string|null;details:string;dueAt:string;codAmount:number;paidAmount:number;costAmount?:number;proof:string|null;closedAt:string|null;unit:Unit;sale:{invoiceNumber:string}|null};
type Data={records:RecordRow[];units:Unit[];products:{id:string;name:string;sku:string}[];sales:{id:string;invoiceNumber:string;total:number;paidAmount:number}[];owner:boolean;canWriteCosts:boolean};
const actionLabels:Record<OperationUpdate["action"],string>={DISPATCH:"Hand over to rider",DELIVER:"Record delivery proof",COLLECT:"Record COD payment",CLOSE:"Close delivery",RETURN:"Record partner return",SETTLE:"Record partner sale & payment",PASS:"Pass return inspection",FAIL:"Needs more repair work",ACCEPT:"Accept inspection",VALUE:"Record agreed supplier obligation",REJECT:"Reject & return to customer"};
export function WorkflowField({label,children}:{label:string;children:ReactNode}) {const control=isValidElement<{"aria-label"?:string}>(children)?cloneElement(children,{"aria-label":children.props["aria-label"]??label}):children;return <label className="security-field">{label}{control}</label>;}
export function useSubmission() {
  const [submission]=useState(()=>{
    let last={body:"",key:""};
    return Object.assign((body:Record<string,unknown>)=>{const text=JSON.stringify(body);if(last.body!==text)last={body:text,key:crypto.randomUUID()};return {...body,requestKey:last.key};},{reset:()=>{last={body:"",key:""};}});
  });
  return submission;
}
export async function workflowRequest(url:string,body:unknown,method="POST") {
  if(!navigator.onLine)throw new Error("You’re offline. Nothing was submitted. Reconnect before saving.");
  const response=await fetch(url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const result=await response.json();if(!response.ok)throw new Error(result.error??"This action was not confirmed. Refresh and retry.");return result;
}
export function OperationsDesk({kind:initialKind}:{kind:OperationKind}) {
  const [direction,setDirection]=useState("OUT");
  const [kind,setKind]=useState(initialKind);
  const [data,setData]=useState<Data|null>(null);
  const [error,setError]=useState("");const [notice,setNotice]=useState("");const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);
  const errorRef=useRef<HTMLDivElement>(null);
  const generation=useRef(0);
  useEffect(()=>{if(error)errorRef.current?.focus();},[error]);
  const submission=useSubmission();
  const load=useCallback(async()=>{const request=++generation.current;const response=await fetch(`/api/operations?kind=${kind}`,{cache:"no-store"});const body=await response.json();if(!response.ok)throw new Error(body.error);if(request===generation.current){setData(body);setLoading(false);setError("");}},[kind]);
  useEffect(()=>{let active=true;Promise.resolve().then(()=>{if(active){setLoading(true);setData(null);void load().catch(cause=>{if(active){setError(cause.message);setLoading(false);}});}});return()=>{active=false};},[load]);
  async function create(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();const element=event.currentTarget;const form=new FormData(element);setBusy(true);setError("");setNotice("");
    const unitId=String(form.get("unitId")||"");const unit=data?.units.find(unit=>unit.id===unitId);
    const intake=kind==="TRADE_IN"||kind==="RETURN"||kind==="PARTNER"&&direction==="IN";
    const inspection=intake?Object.fromEntries(["identityVerified","ownershipVerified","identifiersMatch","activationLockOff","stolenCheckClear","receiptPresent","boxPresent"].map(key=>[key,form.get(key)==="on"])):undefined;
    try {
      await workflowRequest("/api/operations",submission({kind,partnerDirection:kind==="PARTNER"?direction:"OUT",...(unitId?{unitId}:{}),...(!unitId && form.get("productId")?{productId:form.get("productId"),identifier:form.get("identifier")}:{}),party:form.get("party"),contact:form.get("contact")||undefined,destination:form.get("destination")||undefined,details:form.get("details"),reference:form.get("reference")||undefined,dueAt:form.get("dueAt")?new Date(String(form.get("dueAt"))).toISOString():undefined,codAmount:Number(form.get("codAmount")||0),...(kind==="DELIVERY"?{saleId:unit?.saleItem?.saleId}:{}),...(inspection?{inspection:{...inspection,missingDocumentsReason:form.get("missingDocumentsReason")||undefined,...(form.get("batteryHealth")?{batteryHealth:Number(form.get("batteryHealth"))}:{})}}:{})}));
      submission.reset();element.reset();setNotice(`${operationLabels[kind]} saved. The device’s custody and history were updated.`);await load();
    }catch(cause){setError(cause instanceof Error?cause.message:"Save was not confirmed. Your input is preserved; retry the same submission.");}finally{setBusy(false);}
  }
  async function update(event:FormEvent<HTMLFormElement>,record:RecordRow) {
    event.preventDefault();const form=new FormData(event.currentTarget);setBusy(true);setError("");setNotice("");
    try {
      await workflowRequest("/api/operations",submission({id:record.id,version:record.version,action:form.get("action"),proof:form.get("proof")||undefined,note:form.get("note")||undefined,...(form.get("amount")?{amount:Number(form.get("amount"))}:{}),method:form.get("method")||undefined,reference:form.get("reference")||undefined,...(form.get("costAmount")?{costAmount:Number(form.get("costAmount"))}:{}),password:form.get("password")||undefined}),"PATCH");
      submission.reset();setNotice("Action confirmed and added to the device history.");await load();
    }catch(cause){setError(cause instanceof Error?cause.message:"Action not confirmed. Refresh and retry.");}finally{setBusy(false);}
  }
  const intake=kind==="TRADE_IN"||kind==="RETURN"||kind==="PARTNER"&&direction==="IN";
  const units=data?.units.filter(unit=>intake?["SOLD","RETURNED"].includes(unit.status):kind==="DELIVERY"?unit.status==="SOLD":unit.status==="IN_STOCK" || kind==="REPAIR"&&unit.status==="IN_REPAIR")??[];
  return <div className="workflow-desk security-stack">
    <div><p className="security-eyebrow">Shop operations</p><h2>{operationLabels[kind]} workspace</h2><p className="security-detail">{kind==="REPAIR"?"Assign an available device, track its due date, and inspect it before returning it to stock.":kind==="DELIVERY"?"Track the rider, named handover, delivery proof, and every COD payment against the actual sale.":kind==="PARTNER"?"Track device custody, due dates, inspected returns, and owner-approved partner sales.":"Verify ownership and device locks before intake. Devices stay quarantined until inspection and approval."}</p></div>
    {(kind==="TRADE_IN"||kind==="RETURN")&&<div className="workflow-segments" role="group" aria-label="Intake type"><button onClick={()=>{setError("");setKind("TRADE_IN")}} aria-pressed={kind==="TRADE_IN"}>Trade-ins</button><button onClick={()=>{setError("");setKind("RETURN")}} aria-pressed={kind==="RETURN"}>Returns</button></div>}
    {error&&<div ref={errorRef} tabIndex={-1} role="alert" className="security-error">{error}<button className="security-link" onClick={()=>void load().catch(cause=>setError(cause.message))}>Refresh records</button></div>}{notice&&<p role="status" className="security-notice">{notice}</p>}
    {loading?<p role="status">Loading live records…</p>:data&&<>
      <details className="security-panel" open={!data.records.length}><summary>New {operationLabels[kind].toLowerCase()}</summary><form key={`${kind}-${direction}`} onSubmit={create} className="security-stack"><div className="workflow-fields">
        {kind==="PARTNER"&&<WorkflowField label="Partner movement"><select value={direction} onChange={event=>setDirection(event.target.value)}><option value="OUT">Shop device out to a partner</option><option value="IN">Receive a borrowed / consignment device</option></select></WorkflowField>}
        <WorkflowField label={intake?"Existing device (or enter a new trade-in below)":"Physical device"}><select name="unitId" required={!intake}><option value="">{intake?"New trade-in / identify by IMEI or serial":"Choose an eligible device"}</option>{units.map(unit=><option key={unit.id} value={unit.id}>{unit.product.name} · {unit.imei||unit.serialNumber} · {unit.status.replaceAll("_"," ")}</option>)}</select></WorkflowField>
        {intake&&<><WorkflowField label="Product variant for identifier lookup"><select name="productId"><option value="">Choose variant for a new identifier</option>{data.products.map(product=><option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}</select></WorkflowField><WorkflowField label="IMEI or serial for identifier lookup"><input name="identifier" maxLength={40} autoCapitalize="characters"/></WorkflowField></>}
        <WorkflowField label={kind==="REPAIR"?"Repairer":kind==="DELIVERY"?"Responsible rider":kind==="PARTNER"?"Dealer / partner":"Customer name"}><input name="party" required maxLength={120}/></WorkflowField>
        <WorkflowField label="Contact number"><input name="contact" type="tel" maxLength={80}/></WorkflowField>
        {kind==="DELIVERY"&&<><WorkflowField label="Destination & customer handover details"><input name="destination" required maxLength={240}/></WorkflowField><WorkflowField label="Cash on delivery obligation (KES)"><input type="number" name="codAmount" min="0" max="2000000000" step="1" defaultValue="0"/></WorkflowField><p className="security-detail">Select the sold device; its sale is linked automatically. Financing collections stay in Lipa. COD cannot exceed the sale’s unpaid balance.</p></>}
        <WorkflowField label={kind==="REPAIR"?"Due date (blank: two days)":"Due date"}><input name="dueAt" type="datetime-local" required={kind!=="REPAIR"}/></WorkflowField>
        <WorkflowField label="Reference / receipt number"><input name="reference" maxLength={100}/></WorkflowField>
      </div><WorkflowField label="Reason and operational details"><textarea name="details" required maxLength={1000} rows={3}/></WorkflowField>
      {intake&&<fieldset className="security-panel"><legend>Verify the physical device</legend>{[["identityVerified","Customer identity verified"],["ownershipVerified","Ownership verified"],["identifiersMatch","Physical identifiers match the evidence"],["activationLockOff","Find My / activation lock is off"],["stolenCheckClear","Stolen-device check is clear"],["receiptPresent","Original receipt present"],["boxPresent","Box present"]].map(([name,label],index)=><label key={name} className="security-check"><input name={name} type="checkbox" required={index<5}/><span>{label}</span></label>)}<WorkflowField label="Reason for a missing receipt or box"><textarea name="missingDocumentsReason" maxLength={500} rows={2}/></WorkflowField><WorkflowField label="Battery health if verified (%)"><input name="batteryHealth" type="number" min="0" max="100" step="1"/></WorkflowField><p className="security-detail">Inspect manually. The PWA cannot read another phone’s IMEI, Find My status, or battery health automatically. Returns do not automatically refund or cancel financing.</p></fieldset>}
      <button className="security-primary" disabled={busy}>{busy?"Saving…":`Save ${operationLabels[kind].toLowerCase()}`}</button></form></details>
      <section className="security-stack" aria-label="Operation records"><h3>{data.records.length?"Recorded work":"No work recorded yet"}</h3>{!data.records.length&&<p className="security-detail">Use New {operationLabels[kind].toLowerCase()} to create the first live record. Nothing is simulated.</p>}{data.records.map(record=>{
        const actions=(Object.keys(actionLabels) as OperationUpdate["action"][]).filter(action=>{try{nextOperationState(kind,record.status,action);return !(action==="VALUE"||action==="SETTLE"||kind==="TRADE_IN"&&action==="ACCEPT")||data.owner;}catch{return false;}});
        const overdue=!record.closedAt&&new Date(record.dueAt)<new Date();
        return <article className="security-panel" data-operation-id={record.id} data-version={record.version} key={`${record.id}-${record.version}`}><div className="workflow-row"><div><h3>{record.unit.product.name}</h3><p className="security-detail">{record.unit.imei||record.unit.serialNumber} · {record.party}{kind==="PARTNER"?` · ${record.partnerDirection==="IN"?"Borrowed in":"Out with partner"}`:""}</p></div><span className="workflow-state">{overdue?"Overdue · ":""}{record.status.replaceAll("_"," ")}</span></div><dl className="workflow-facts"><div><dt>Due</dt><dd>{new Date(record.dueAt).toLocaleString()}</dd></div>{record.destination&&<div><dt>Destination</dt><dd>{record.destination}</dd></div>}{record.contact&&<div><dt>Contact</dt><dd><a href={`tel:${record.contact.replace(/[^+\d]/g,"")}`}>{record.contact}</a></dd></div>}{kind==="DELIVERY"&&<div><dt>COD remaining</dt><dd>KES {(record.codAmount-record.paidAmount).toLocaleString()} · {record.sale?.invoiceNumber}</dd></div>}{data.owner&&record.costAmount!==null&&record.costAmount!==undefined&&<div><dt>Recorded costs</dt><dd>KES {record.costAmount.toLocaleString()}</dd></div>}</dl><p className="security-detail">{record.details}</p>{record.proof&&<p className="security-detail">Latest proof: {record.proof}</p>}<Link href={`/devices/${record.unit.id}`} className="security-link">Open device history</Link>
          {actions.length>0&&<details><summary>Record next action</summary><form className="security-stack" onSubmit={event=>void update(event,record)}><WorkflowField label="Action"><select name="action">{actions.map(action=><option key={action} value={action}>{actionLabels[action]}</option>)}</select></WorkflowField><WorkflowField label="Named handover / inspection / settlement proof"><textarea name="proof" maxLength={500} rows={2}/></WorkflowField>{["DELIVERY","PARTNER"].includes(kind)&&<div className="workflow-fields"><WorkflowField label="Actual payment received (KES)"><input name="amount" type="number" min="1" step="1" max="2000000000"/></WorkflowField><WorkflowField label="Payment method"><select name="method"><option value="">Choose for a payment action</option><option value="CASH">Cash</option><option value="MPESA">M-Pesa</option><option value="CARD">Card</option></select></WorkflowField><WorkflowField label="Verified payment reference"><input name="reference" maxLength={100}/></WorkflowField></div>}{data.canWriteCosts&&<WorkflowField label={kind==="TRADE_IN"?"Owner-approved valuation (KES)":"Additional recorded cost (KES; optional)"}><input name="costAmount" type="number" min="0" step="1" max="2000000000"/></WorkflowField>}{data.owner&&<WorkflowField label="Confirm password for financial approval"><input name="password" type="password" autoComplete="current-password"/></WorkflowField>}<p className="security-detail">Save only after confirming the real handover or payment. Costs and valuation remain owner-only; stock returns require a passed inspection.</p><button className="security-primary" disabled={busy}>{busy?"Confirming…":"Confirm action"}</button></form></details>}
        </article>;
      })}</section>
    </>}
  </div>;
}
