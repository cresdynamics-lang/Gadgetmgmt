import { z } from "zod";

const strings=z.array(z.string().trim().min(1).max(240)).max(200).default([]);
export const catalogRecordSchema=z.object({
  externalId:z.string().trim().min(1).max(240),name:z.string().trim().min(1).max(240),brand:z.string().trim().min(1).max(80),
  manufacturer:z.string().max(160).nullable().default(null),category:z.string().max(80),family:z.string().max(120).nullable().default(null),granularity:z.enum(["MODEL","VARIANT","REFERENCE","FAMILY"]).default("MODEL"),
  description:z.string().max(1200).nullable().default(null),modelNumbers:strings,partNumbers:strings,gtins:strings,colors:strings,
  storage:strings,memory:strings,regions:strings,compatibility:strings,released:z.string().max(40).nullable().default(null),discontinued:z.string().max(40).nullable().default(null),
  specifications:z.record(z.string(),z.unknown()),sourceUrl:z.url().refine(value=>new URL(value).protocol==="https:"),
  identifiers:z.array(z.object({kind:z.enum(["MODEL","MPN","GTIN","PLATFORM","BOARD","CATALOG","WIKIDATA","ALIAS"]),value:z.string().trim().min(1).max(240)})).max(400),
}).strict();
export type CatalogRecord=z.infer<typeof catalogRecordSchema>;
export type CatalogPage={records:CatalogRecord[];rejected:number;nextCursor:string|null;complete:boolean;nextDelaySeconds?:number};
export const normalizedIdentifier=(value:string)=>value.normalize("NFKC").trim().toUpperCase();
export function unique(values:unknown):string[]{return [...new Set((Array.isArray(values)?values:[values]).filter((value):value is string=>typeof value==="string"&&!!value.trim()).map(value=>value.trim()))].sort();}
export function validGtin(value:string){if(/^0+$/.test(value)||!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(value))return false;let sum=0;for(let i=value.length-2,multiplier=3;i>=0;i--,multiplier=4-multiplier)sum+=Number(value[i])*multiplier;return (10-sum%10)%10===Number(value.at(-1));}
export function missingFields(record:{modelNumbers:string[];partNumbers:string[];gtins:string[];colors:string[];storage:string[];memory:string[];regions:string[];compatibility:string[]}){
  return (["modelNumbers","partNumbers","gtins","colors","storage","memory","regions","compatibility"] as const).filter(field=>record[field].length===0);
}
