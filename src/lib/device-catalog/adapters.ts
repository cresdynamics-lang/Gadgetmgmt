import { z } from "zod";
import { catalogRecordSchema, unique, validGtin, type CatalogPage, type CatalogRecord } from "./types";

export const CATALOG_SOURCES={
  appledb:{name:"AppleDB",license:"MIT",licenseUrl:"https://github.com/littlebyteorg/appledb/blob/main/LICENSE",refreshSeconds:86400,origin:"https://api.appledb.dev",description:"Apple hardware and accessories; source-published model/platform identifiers and lifecycle information."},
  wikidata:{name:"Wikidata · Samsung",license:"CC0-1.0",licenseUrl:"https://www.wikidata.org/wiki/Wikidata:Licensing",refreshSeconds:900,origin:"https://www.wikidata.org",description:"Community-maintained Samsung Electronics device reference facts; retail variants and specifications may be incomplete."},
} as const;
export type CatalogSourceId=keyof typeof CATALOG_SOURCES;
export function isCatalogSource(value:string):value is CatalogSourceId{return Object.hasOwn(CATALOG_SOURCES,value);}
const nonDevices=new Set(["Software","SDK","Simulator","Virtual Machine","Credit Cards"]);
function category(type:string){if(type==="iPhone")return "Smartphone";if(type.startsWith("iPad"))return "Tablet";if(/Mac|Book|Xserve|eMac/.test(type))return "Computer";if(type==="Apple Watch")return "Wearable";if(/AirPods|Beats|Audio|Headset|HomePod/.test(type))return "Audio";if(/Cases|Adapters|Accessories|Power|Batteries|Keyboard|Mouse|Trackpad|Remote|Pencil|AirTag/.test(type))return "Accessory";return "Other";}

export function appleDbPage(data:unknown):CatalogPage {
  if(!Array.isArray(data)||data.length>10000)throw new Error("AppleDB returned an invalid or oversized device index.");
  const records:CatalogRecord[]=[];const seen=new Set<string>();let rejected=0;
  for(const row of data){
    if(!row||typeof row!=="object"){rejected++;continue;}
    if(nonDevices.has(row.type))continue;
    const models=unique(row.model),platforms=unique(row.identifier),boards=unique(row.board);
    const colors=Array.isArray(row.colors)?unique(row.colors.map((color:unknown)=>color&&typeof color==="object"&&"name" in color?color.name:null)):[];
    const info:Record<string,unknown>[]=Array.isArray(row.info)?row.info.filter((item:unknown)=>item&&typeof item==="object"):[];
    const storage=unique(info.flatMap(item=>item.Storage??item["Storage Capacity"]??[])),memory=unique(info.flatMap(item=>item.RAM??[])),compatibility=unique(info.flatMap(item=>item["Compatible Devices"]??[]));
    // Only documented public hardware fields; no physical serials/IMEIs, prices or images.
    const specifications=Object.fromEntries(["soc","arch","cpid","bdid","board","identifier","colors","info","alias","group","internal"].filter(key=>row[key]!==undefined).map(key=>[key,row[key]]));
    const candidate=catalogRecordSchema.safeParse({externalId:row.key,name:row.name,brand:String(row.type).startsWith("Beats")?"Beats":"Apple",category:category(String(row.type)),family:row.type??null,modelNumbers:models,partNumbers:[],gtins:[],colors,storage,memory,regions:[],compatibility,released:typeof row.released==="string"?row.released:null,discontinued:typeof row.discontinued==="string"?row.discontinued:null,specifications,sourceUrl:`https://api.appledb.dev/device/${encodeURIComponent(String(row.key))}.json`,identifiers:[...models.map(value=>({kind:"MODEL",value})),...platforms.map(value=>({kind:"PLATFORM",value})),...boards.map(value=>({kind:"BOARD",value}))]});
    if(candidate.success&&JSON.stringify(specifications).length<=64000){if(seen.has(candidate.data.externalId))throw new Error("Duplicate AppleDB identities; previous catalog data was preserved.");seen.add(candidate.data.externalId);records.push(candidate.data);}else rejected++;
  }
  if(data.length&&!records.length)throw new Error("No usable hardware records were found; previous catalog data was preserved.");
  return {records,rejected,nextCursor:null,complete:true};
}

const wikidataCursorSchema=z.discriminatedUnion("phase",[
  z.object({phase:z.literal("search"),offset:z.number().int().min(0).max(1000000)}),
  z.object({phase:z.literal("details"),ids:z.array(z.string().regex(/^Q[1-9]\d*$/)).min(1).max(25),nextOffset:z.number().int().min(0).max(1000000).nullable()}),
]);
function wikiCursor(cursor:string|null){if(!cursor)return {phase:"search" as const,offset:0};try{return wikidataCursorSchema.parse(JSON.parse(cursor));}catch{throw new Error("Invalid Wikidata checkpoint.");}}
export function sourceRequest(sourceId:CatalogSourceId,cursor:string|null):URL {
  if(sourceId==="appledb")return new URL("https://api.appledb.dev/device/main.json");
  const state=wikiCursor(cursor),url=new URL("https://www.wikidata.org/w/api.php");url.searchParams.set("format","json");url.searchParams.set("maxlag","5");
  if(state.phase==="search"){for(const [key,value] of Object.entries({action:"query",list:"search",srsearch:"haswbstatement:P176=Q20718",srnamespace:"0",srlimit:"25",srsort:"create_timestamp_desc",sroffset:String(state.offset)}))url.searchParams.set(key,value);}
  else {for(const [key,value] of Object.entries({action:"wbgetentities",ids:state.ids.join("|"),props:"labels|aliases|descriptions|claims",languages:"en|mul"}))url.searchParams.set(key,value);}
  return url;
}
export function wikidataPage(data:unknown,cursor:string|null=null):CatalogPage {
  if(!data||typeof data!=="object")throw new Error("Invalid Wikidata response.");
  const body=data as Record<string,unknown>;if(body.error)throw new Error("Wikidata reported an API/load error; checkpoint was preserved and cooldown scheduled.");
  const state=wikiCursor(cursor);
  if(state.phase==="search"){
    const parsed=z.object({query:z.object({search:z.array(z.object({title:z.string().regex(/^Q[1-9]\d*$/)})).max(25)}),continue:z.object({sroffset:z.number().int().min(0).max(1000000)}).optional()}).safeParse(body);
    if(!parsed.success)throw new Error("Wikidata returned an invalid discovery page; checkpoint was preserved.");
    const nextOffset=parsed.data.continue?.sroffset??null;if(nextOffset!==null&&nextOffset<=state.offset)throw new Error("Wikidata pagination did not advance.");
    const ids=unique(parsed.data.query.search.map(item=>item.title));
    return {records:[],rejected:0,nextCursor:ids.length?JSON.stringify({phase:"details",ids,nextOffset}):nextOffset!==null?JSON.stringify({phase:"search",offset:nextOffset}):null,complete:!ids.length&&nextOffset===null,...(ids.length?{nextDelaySeconds:60}:{})};
  }
  const entities=body.entities;if(!entities||typeof entities!=="object"||Array.isArray(entities))throw new Error("Invalid Wikidata entity response; checkpoint was preserved.");
  const records:CatalogRecord[]=[];let rejected=0;
  for(const id of state.ids){
    const entity=(entities as Record<string,unknown>)[id];if(!entity||typeof entity!=="object")throw new Error("Wikidata omitted a requested identity; checkpoint was preserved.");
    const row=entity as {id?:string;missing?:string;labels?:Record<string,{value?:string}>;aliases?:Record<string,{value?:string}[]>;descriptions?:Record<string,{value?:string}>;claims?:Record<string,{mainsnak?:{datavalue?:{value?:unknown}}}[]>};
    if(row.missing!==undefined){rejected++;continue;}if(row.id!==id)throw new Error("Wikidata returned a mismatched identity.");
    const values=(property:string)=>(row.claims?.[property]??[]).map(statement=>statement.mainsnak?.datavalue?.value).filter(value=>value!==undefined);
    const textValues=(property:string)=>unique(values(property));
    const references=(property:string)=>unique(values(property).map(value=>value&&typeof value==="object"&&"id" in value?value.id:null));
    const makers=references("P176");if(!makers.includes("Q20718")){rejected++;continue;}
    const manufacturer=unique(makers.map(value=>value==="Q312"?"Apple":["Q20718","Q20716"].includes(value)?"Samsung":null)).join(" / ");
    const brands=references("P1716");const brand=brands.includes("Q312")?"Apple":brands.some(value=>["Q20718","Q20716"].includes(value))?"Samsung":"Unspecified";const name=row.labels?.en?.value??row.labels?.mul?.value??Object.values(row.labels??{})[0]?.value;
    const modelNumbers=textValues("P13351"),catalog=textValues("P528"),gtins=textValues("P3962").filter(validGtin);const hasProductIdentifier=!!(modelNumbers.length||catalog.length||gtins.length);const types=references("P31"),isFamily=types.includes("Q811701")||types.includes("Q98924064");if(types.includes("Q125005976")||types.includes("Q431289")&&!isFamily){rejected++;continue;}const aliases=unique((row.aliases?.en??[]).map(alias=>alias.value));
    const specifications={manufacturerEntityIds:makers,catalogCodes:catalog,aliases,processorEntityIds:references("P880"),typeEntityIds:references("P31"),colorEntityIds:references("P462"),storageQuantities:values("P2928"),publicationDates:values("P577"),height:values("P2048"),width:values("P2049"),thickness:values("P2610"),mass:values("P2067")};
    const record=catalogRecordSchema.safeParse({externalId:id,name,brand,manufacturer,granularity:isFamily?"FAMILY":hasProductIdentifier?"MODEL":"REFERENCE",category:"Other",family:isFamily?name?.slice(0,120)??null:null,description:row.descriptions?.en?.value?.slice(0,1200)??null,modelNumbers,partNumbers:[],gtins,colors:[],storage:[],memory:[],regions:[],compatibility:[],released:null,discontinued:null,specifications,sourceUrl:`https://www.wikidata.org/wiki/${id}`,identifiers:[{kind:"WIKIDATA",value:id},...modelNumbers.map(value=>({kind:"MODEL",value})),...catalog.map(value=>({kind:"CATALOG",value})),...gtins.map(value=>({kind:"GTIN",value})),...aliases.map(value=>({kind:"ALIAS",value}))]});
    if(!record.success||name===id){rejected++;continue;}records.push(record.data);
  }
  return {records,rejected,nextCursor:state.nextOffset===null?null:JSON.stringify({phase:"search",offset:state.nextOffset}),complete:state.nextOffset===null};
}
export function parseSource(sourceId:CatalogSourceId,data:unknown,cursor:string|null=null){return sourceId==="appledb"?appleDbPage(data):wikidataPage(data,cursor);}
