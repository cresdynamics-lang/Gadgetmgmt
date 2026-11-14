import { z } from "zod";

export const OPERATION_KINDS = ["REPAIR", "DELIVERY", "PARTNER", "TRADE_IN", "RETURN"] as const;
export type OperationKind = typeof OPERATION_KINDS[number];
export const operationPages = { REPAIR: "/repairs", DELIVERY: "/deliveries", PARTNER: "/partners", TRADE_IN: "/trade-ins", RETURN: "/trade-ins" } as const;
export const operationCapabilities = { REPAIR: "repairs", DELIVERY: "deliveries", PARTNER: "partners", TRADE_IN: "tradeIns", RETURN: "tradeIns" } as const;
export const operationLabels = { REPAIR: "Repair", DELIVERY: "Delivery", PARTNER: "Partner handover", TRADE_IN: "Trade-in", RETURN: "Return inspection" } as const;
const text = (max:number) => z.string().trim().min(1).max(max);
export const inspectionSchema = z.object({ identityVerified:z.boolean(), ownershipVerified:z.boolean(), identifiersMatch:z.boolean(), activationLockOff:z.boolean(), stolenCheckClear:z.boolean(), receiptPresent:z.boolean(), boxPresent:z.boolean(), missingDocumentsReason:z.string().trim().max(500).optional(), batteryHealth:z.number().int().min(0).max(100).optional() }).strict();
export const operationCreate = z.object({ requestKey:z.uuid(), kind:z.enum(OPERATION_KINDS), partnerDirection:z.enum(["IN","OUT"]).default("OUT"), unitId:z.string().cuid().optional(), productId:z.string().cuid().optional(), identifier:z.string().trim().max(40).optional(), party:text(120), contact:z.string().trim().max(80).optional(), destination:z.string().trim().max(240).optional(), saleId:z.string().cuid().optional(), reference:z.string().trim().max(100).optional(), details:text(1000), dueAt:z.iso.datetime({offset:true}).optional(), codAmount:z.number().int().min(0).max(2000000000).default(0), inspection:inspectionSchema.optional() }).strict();
export const operationUpdate = z.object({ requestKey:z.uuid(), id:z.string().cuid(), version:z.number().int().min(0), action:z.enum(["DISPATCH","DELIVER","COLLECT","CLOSE","RETURN","SETTLE","PASS","FAIL","ACCEPT","REJECT","VALUE"]), proof:z.string().trim().max(500).optional(), note:z.string().trim().max(1000).optional(), amount:z.number().int().positive().max(2000000000).optional(), method:z.enum(["CASH","MPESA","CARD","BANK"]).optional(), reference:z.string().trim().max(100).optional(), costAmount:z.number().int().nonnegative().max(2000000000).optional(), password:z.string().min(1).max(256).optional() }).strict();
export type OperationCreate = z.infer<typeof operationCreate>;
export type OperationUpdate = z.infer<typeof operationUpdate>;
export class OperationError extends Error { constructor(public status:number,message:string) { super(message); } }
export function validateInspection(value:z.infer<typeof inspectionSchema> | undefined) {
  if (!value || !value.identityVerified || !value.ownershipVerified || !value.identifiersMatch || !value.activationLockOff || !value.stolenCheckClear) throw new OperationError(400,"Verify identity, ownership, matching identifiers, activation lock and stolen-device checks before intake.");
  if ((!value.receiptPresent || !value.boxPresent) && !value.missingDocumentsReason?.trim()) throw new OperationError(400,"Record why the receipt or box is missing.");
}
export function nextOperationState(kind:OperationKind,status:string,action:OperationUpdate["action"]) {
  const transitions:Record<OperationKind,Record<string,Partial<Record<OperationUpdate["action"],string>>>> = {
    REPAIR:{IN_PROGRESS:{PASS:"COMPLETED",FAIL:"REVIEW"},REVIEW:{PASS:"COMPLETED"}},
    DELIVERY:{READY:{DISPATCH:"IN_TRANSIT"},IN_TRANSIT:{DELIVER:"DELIVERED",COLLECT:"IN_TRANSIT"},DELIVERED:{COLLECT:"DELIVERED",CLOSE:"COMPLETED"}},
    PARTNER:{OUT:{RETURN:"RETURNED",SETTLE:"SETTLED"},BORROWED_IN:{RETURN:"RETURNED",VALUE:"BORROWED_IN"},PAYABLE:{SETTLE:"SETTLED"}},
    TRADE_IN:{INSPECTION:{ACCEPT:"COMPLETED",REJECT:"REJECTED"}},
    RETURN:{INSPECTION:{ACCEPT:"COMPLETED",REJECT:"REJECTED"}},
  };
  const next=transitions[kind][status]?.[action];
  if (!next) throw new OperationError(409,"This action is not available in the current state. Refresh the record.");
  return next;
}
export function presentOperation<T extends {costAmount:unknown;requestHash?:unknown;requestKey?:unknown;paidAmount?:unknown;kind?:unknown}>(record:T,owner:boolean) {
  const {costAmount,requestHash,requestKey,paidAmount,...safe}=record;
  void requestHash;void requestKey;
  return {...safe,...(owner?{costAmount}:{}),...(typeof paidAmount==="number" && (owner||record.kind!=="PARTNER")?{paidAmount}:{})};
}
export function csvCell(value:unknown) {
  if(typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let text=String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
}
