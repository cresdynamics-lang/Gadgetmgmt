import { Prisma } from "@prisma/client";

import {
  activationAllowsStock,
  maskImei,
  maskSerial,
  normalizeImei,
  normalizeSerial,
  stockDeltas,
  tracksUnits,
  unidentifiedSellable,
  type ActivationLock,
  type CosmeticGrade,
  type DeviceClaim,
  type DeviceCondition,
  type NetworkLock,
  type UnitStatus,
} from "@/lib/device-units";

type Transaction = Prisma.TransactionClient;

export class StockUnitError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "StockUnitError";
    this.status = status;
  }
}

export type DeviceRecordInput = {
  productId: string;
  imei?: string | null;
  imei2?: string | null;
  serialNumber?: string | null;
  barcode?: string | null;
  condition: DeviceCondition;
  cosmeticGrade?: CosmeticGrade | null;
  color?: string | null;
  storage?: string | null;
  ram?: string | null;
  screenSize?: string | null;
  processor?: string | null;
  region?: string | null;
  camera?: string | null;
  networkLock: NetworkLock;
  osVersion?: string | null;
  activationLock: ActivationLock;
  batteryHealth?: number | null;
  location?: string | null;
  supplierName?: string | null;
  purchaseReference?: string | null;
  notes?: string | null;
};

function clean(value: string | null | undefined, max: number) {
  const text = value?.trim() ?? "";
  if (!text) return null;
  return text.slice(0, max);
}

function identifiersOf(input: DeviceRecordInput) {
  const imei = input.imei ? normalizeImei(input.imei) : null;
  const imei2 = input.imei2 ? normalizeImei(input.imei2) : null;
  const serialNumber = input.serialNumber ? normalizeSerial(input.serialNumber) : null;
  if (input.imei?.trim() && !imei) throw new StockUnitError(400, "Enter a 15-digit IMEI. The check digit has to match.");
  if (input.imei2?.trim() && !imei2) throw new StockUnitError(400, "The second IMEI must be 15 digits with a valid check digit.");
  if (input.serialNumber?.trim() && !serialNumber) throw new StockUnitError(400, "Enter a serial number using letters, numbers, or hyphens.");
  if (!imei && !serialNumber) throw new StockUnitError(400, "Enter the IMEI or the serial number.");
  if (imei && imei2 && imei === imei2) throw new StockUnitError(400, "The two IMEIs have to be different.");
  return { imei, imei2, serialNumber };
}

async function assertIdentifierFree(transaction: Transaction, imei: string | null, imei2: string | null, serialNumber: string | null) {
  const imeis = [imei, imei2].filter((value): value is string => Boolean(value));
  const existing = await transaction.stockUnit.findFirst({
    where: {
      OR: [
        ...(imeis.length ? [{ imei: { in: imeis } }, { imei2: { in: imeis } }] : []),
        ...(serialNumber ? [{ serialNumber }] : []),
      ],
    },
    select: { id: true },
  });
  if (existing) throw new StockUnitError(409, "This IMEI or serial is already on record.");
}

export async function recordStockUnit(
  transaction: Transaction,
  input: DeviceRecordInput & { branchId: string; userId: string },
) {
  if (!activationAllowsStock(input.condition, input.activationLock)) {
    throw new StockUnitError(400, "Activation lock is still on. Turn off iCloud or Factory Reset Protection, then record the device.");
  }
  const { imei, imei2, serialNumber } = identifiersOf(input);
  const product = await transaction.product.findFirst({
    where: { id: input.productId, branchId: input.branchId },
    select: { id: true, name: true, sku: true, category: true, unitTracking: true },
  });
  if (!product) throw new StockUnitError(404, "This product is not set up for your branch.");
  if (!tracksUnits(product.category, product.unitTracking)) {
    throw new StockUnitError(409, "This product is counted by quantity. Receive a quantity instead of a device.");
  }

  const inventory = await transaction.inventoryItem.findUnique({
    where: { branchId_productId: { branchId: input.branchId, productId: product.id } },
    select: { id: true, stockOnHand: true, reservedStock: true },
  });
  if (!inventory) throw new StockUnitError(404, "This product is not set up for your branch.");
  const inStockUnits = await transaction.stockUnit.count({
    where: { branchId: input.branchId, productId: product.id, status: "IN_STOCK" },
  });
  const unidentified = unidentifiedSellable(inventory.stockOnHand, inventory.reservedStock, inStockUnits);
  if (unidentified < 0) throw new StockUnitError(409, "The stock count and the device list disagree. Check the quantities before recording another device.");

  await assertIdentifierFree(transaction, imei, imei2, serialNumber);
  const identifying = unidentified > 0;
  if (!identifying) {
    const received = await transaction.inventoryItem.updateMany({
      where: { id: inventory.id, stockOnHand: inventory.stockOnHand, reservedStock: inventory.reservedStock },
      data: { stockOnHand: { increment: 1 } },
    });
    if (received.count !== 1) throw new StockUnitError(409, "Stock changed while recording this device. Try again.");
  }

  const unit = await transaction.stockUnit.create({
    data: {
      branchId: input.branchId,
      productId: product.id,
      recordedById: input.userId,
      imei,
      imei2,
      serialNumber,
      barcode: clean(input.barcode, 32),
      status: "IN_STOCK",
      condition: input.condition,
      cosmeticGrade: input.cosmeticGrade ?? null,
      color: clean(input.color, 40),
      storage: clean(input.storage, 40),
      ram: clean(input.ram, 40),
      screenSize: clean(input.screenSize, 40),
      processor: clean(input.processor, 80),
      region: clean(input.region, 40),
      camera: clean(input.camera, 40),
      networkLock: input.networkLock,
      osVersion: clean(input.osVersion, 40),
      activationLock: input.activationLock,
      batteryHealth: input.batteryHealth ?? null,
      location: clean(input.location, 80),
      supplierName: clean(input.supplierName, 120),
      purchaseReference: clean(input.purchaseReference, 100),
      notes: clean(input.notes, 300),
    },
    select: { id: true, imei: true, serialNumber: true, status: true },
  });

  if (!identifying) {
    const label = imei ? maskImei(imei) : serialNumber ? maskSerial(serialNumber) : "device";
    await transaction.inventoryMovement.create({
      data: {
        branchId: input.branchId,
        productId: product.id,
        userId: input.userId,
        type: "RECEIPT",
        quantity: 1,
        reference: clean(input.purchaseReference, 100),
        note: `Device received · ${label}`,
      },
    });
  }

  await transaction.deviceEvent.create({data:{branchId:input.branchId,unitId:unit.id,userId:input.userId,kind:identifying?"Device identified":"Device received",note:input.purchaseReference||"Physical identifier recorded"}});
  return { unit, product, identifiedExisting: identifying, stockOnHand: identifying ? inventory.stockOnHand : inventory.stockOnHand + 1 };
}

export async function moveStockUnit(
  transaction: Transaction,
  input: { id: string; branchId: string; status: UnitStatus; location?: string | null; userId?: string },
) {
  const unit = await transaction.stockUnit.findFirst({
    where: { id: input.id, branchId: input.branchId },
    select: {
      id: true,
      productId: true,
      status: true,
      condition: true,
      activationLock: true,
      saleItemId: true,
      location: true,
    },
  });
  if (!unit) throw new StockUnitError(404, "That device is not at your branch.");
  if (unit.status === "SOLD" || input.status === "SOLD") {
    throw new StockUnitError(409, "Sold devices move through a sale or a return, not a stock edit.");
  }
  if (unit.saleItemId && unit.status === "RESERVED") {
    throw new StockUnitError(409, "This device is held for a sale. Finish or void that sale before moving it.");
  }
  if ((input.status === "IN_STOCK" || input.status === "RESERVED") && !activationAllowsStock(unit.condition, unit.activationLock)) {
    throw new StockUnitError(400, "Activation lock is still on, so this device cannot go back on the shelf.");
  }

  const deltas = stockDeltas(unit.status, input.status);
  if (!deltas) throw new StockUnitError(409, "That status change is not available.");
  const location = input.location === undefined ? undefined : clean(input.location, 80);

  if (deltas.stockOnHand !== 0 || deltas.reservedStock !== 0) {
    const inventory = await transaction.inventoryItem.findUnique({
      where: { branchId_productId: { branchId: input.branchId, productId: unit.productId } },
      select: { id: true, stockOnHand: true, reservedStock: true },
    });
    if (!inventory) throw new StockUnitError(404, "This product is not set up for your branch.");
    const nextStock = inventory.stockOnHand + deltas.stockOnHand;
    const nextReserved = inventory.reservedStock + deltas.reservedStock;
    if (nextStock < 0 || nextReserved < 0 || nextReserved > nextStock) {
      throw new StockUnitError(409, "That move would make the stock count invalid. Refresh and try again.");
    }
    const updated = await transaction.inventoryItem.updateMany({
      where: { id: inventory.id, stockOnHand: inventory.stockOnHand, reservedStock: inventory.reservedStock },
      data: {
        stockOnHand: { increment: deltas.stockOnHand },
        reservedStock: { increment: deltas.reservedStock },
      },
    });
    if (updated.count !== 1) throw new StockUnitError(409, "Stock changed while moving this device. Try again.");
  }

  const moved = await transaction.stockUnit.updateMany({
    where: { id: unit.id, branchId: input.branchId, status: unit.status },
    data: { status: input.status, ...(location !== undefined ? { location } : {}) },
  });
  if (moved.count !== 1) throw new StockUnitError(409, "This device changed while you were updating it. Refresh and try again.");
  await transaction.deviceEvent.create({data:{branchId:input.branchId,unitId:unit.id,userId:input.userId,kind:"Stock custody changed",note:`${unit.status} → ${input.status}${location?` · ${location}`:""}`}});
  return { id: unit.id, status: input.status };
}

function normalizeClaim(claim: DeviceClaim) {
  if (claim.stockUnitId) return { stockUnitId: claim.stockUnitId };
  const imei = claim.imei ? normalizeImei(claim.imei) : null;
  const serialNumber = claim.serialNumber ? normalizeSerial(claim.serialNumber) : null;
  if (claim.imei && !imei) throw new StockUnitError(400, "Enter a 15-digit IMEI. The check digit has to match.");
  if (claim.serialNumber && !serialNumber) throw new StockUnitError(400, "Enter a serial number using letters, numbers, or hyphens.");
  if (!imei && !serialNumber) throw new StockUnitError(400, "Enter the IMEI or the serial number for each device.");
  return { imei, serialNumber };
}

export async function claimDevicesForSale(
  transaction: Transaction,
  input: {
    branchId: string;
    productId: string;
    category: string;
    unitTracking: boolean | null;
    quantity: number;
    devices: DeviceClaim[] | undefined;
    saleItemId: string;
    userId: string;
    hold: boolean;
    stockSnapshot?: { stockOnHand: number; reservedStock: number };
  },
) {
  const tracked = tracksUnits(input.category, input.unitTracking);
  if (!tracked) {
    if (input.devices?.length) throw new StockUnitError(400, "Quantity items do not take an IMEI or serial.");
    return;
  }
  if (!input.devices || input.devices.length !== input.quantity) {
    throw new StockUnitError(400, "Enter the IMEI or serial for each phone, laptop, or tablet before completing the sale.");
  }

  const inventory = input.stockSnapshot ?? await transaction.inventoryItem.findUnique({
    where: { branchId_productId: { branchId: input.branchId, productId: input.productId } },
    select: { stockOnHand: true, reservedStock: true },
  });
  if (!inventory) throw new StockUnitError(404, "This product is not set up for your branch.");
  const inStockUnits = await transaction.stockUnit.count({
    where: { branchId: input.branchId, productId: input.productId, status: "IN_STOCK" },
  });
  let remainingUnidentified = unidentifiedSellable(inventory.stockOnHand, inventory.reservedStock, inStockUnits);
  const saleItem = await transaction.saleItem.findUniqueOrThrow({where:{id:input.saleItemId},select:{saleId:true}});
  const seen = new Set<string>();

  for (const raw of input.devices) {
    const claim = normalizeClaim(raw);
    if ("stockUnitId" in claim && claim.stockUnitId) {
      if (seen.has(claim.stockUnitId)) throw new StockUnitError(409, "The same device is listed twice in this sale.");
      seen.add(claim.stockUnitId);
      await assertSaleCustody(transaction,claim.stockUnitId);
      const taken = await transaction.stockUnit.updateMany({
        where: { id: claim.stockUnitId, branchId: input.branchId, productId: input.productId, status: "IN_STOCK" },
        data: input.hold
          ? { status: "RESERVED", saleItemId: input.saleItemId }
          : { status: "SOLD", soldAt: new Date(), saleItemId: input.saleItemId },
      });
      if (taken.count !== 1) throw new StockUnitError(409, "That device is no longer in stock. Scan it again.");
      await recordSaleDeviceEvent(transaction,input.hold?"Sale reserved":"Device sold",claim.stockUnitId!,input,saleItem.saleId);
      continue;
    }

    const imei = "imei" in claim ? claim.imei ?? null : null;
    const serialNumber = "serialNumber" in claim ? claim.serialNumber ?? null : null;
    const imeis = [imei].filter((value): value is string => Boolean(value));
    const existing = await transaction.stockUnit.findFirst({
      where: {
        OR: [
          ...(imeis.length ? [{ imei: { in: imeis } }, { imei2: { in: imeis } }] : []),
          ...(serialNumber ? [{ serialNumber }] : []),
        ],
      },
      select: { id: true, branchId: true, productId: true, status: true },
    });
    if (existing) {
      if (existing.branchId !== input.branchId || existing.productId !== input.productId || existing.status !== "IN_STOCK") {
        throw new StockUnitError(409, "This IMEI or serial is already on record.");
      }
      if (seen.has(existing.id)) throw new StockUnitError(409, "The same device is listed twice in this sale.");
      seen.add(existing.id);
      await assertSaleCustody(transaction,existing.id);
      const taken = await transaction.stockUnit.updateMany({
        where: { id: existing.id, status: "IN_STOCK" },
        data: input.hold
          ? { status: "RESERVED", saleItemId: input.saleItemId }
          : { status: "SOLD", soldAt: new Date(), saleItemId: input.saleItemId },
      });
      if (taken.count !== 1) throw new StockUnitError(409, "That device is no longer in stock. Scan it again.");
      await recordSaleDeviceEvent(transaction,input.hold?"Sale reserved":"Device sold",existing.id,input,saleItem.saleId);
      continue;
    }

    if (remainingUnidentified < 1) {
      throw new StockUnitError(409, "Record this device in inventory before selling it. The IMEI is not on an in-stock unit.");
    }
    remainingUnidentified -= 1;
    const createdUnit = await transaction.stockUnit.create({
      data: {
        branchId: input.branchId,
        productId: input.productId,
        recordedById: input.userId,
        imei,
        serialNumber,
        status: input.hold ? "RESERVED" : "SOLD",
        saleItemId: input.saleItemId,
        soldAt: input.hold ? null : new Date(),
        condition: "NEW",
        activationLock: "UNKNOWN",
      },
    });
    await recordSaleDeviceEvent(transaction,input.hold?"Sale reserved":"Device sold",createdUnit.id,input,saleItem.saleId);
  }
}

export async function completeSaleHold(transaction: Transaction, saleId: string) {
  const units=await transaction.stockUnit.findMany({where:{status:"RESERVED",saleItem:{saleId}}});
  for(const unit of units) await recordSaleDeviceEvent(transaction,"Sale settled",unit.id,{branchId:unit.branchId,userId:undefined},saleId);
  await transaction.stockUnit.updateMany({
    where: { status: "RESERVED", saleItem: { saleId } },
    data: { status: "SOLD", soldAt: new Date() },
  });
}

export async function releaseSaleHold(transaction: Transaction, saleId: string) {
  const units=await transaction.stockUnit.findMany({where:{status:"RESERVED",saleItem:{saleId}}});
  for(const unit of units) await transaction.deviceEvent.create({data:{branchId:unit.branchId,unitId:unit.id,kind:"Sale hold released",note:"Unsettled sale released by reconciliation",saleId}});
  await transaction.stockUnit.updateMany({
    where: { status: "RESERVED", saleItem: { saleId } },
    data: { status: "IN_STOCK", saleItemId: null },
  });
}


async function assertSaleCustody(transaction:Transaction,unitId:string) {
  const unit=await transaction.stockUnit.findUniqueOrThrow({where:{id:unitId}});
  if(!activationAllowsStock(unit.condition,unit.activationLock))throw new StockUnitError(409,"Activation lock is not clear. Inspect this device before selling it.");
  const operation=await transaction.operation.findFirst({where:{unitId,closedAt:null}});
  if(operation && !(operation.kind==="PARTNER" && operation.partnerDirection==="IN" && operation.status==="BORROWED_IN" && operation.costAmount && operation.costAmount>0))throw new StockUnitError(409,"Complete the open operation or obtain the approved supplier obligation before selling this device.");
}
async function recordSaleDeviceEvent(transaction:Transaction,kind:string,unitId:string,input:{branchId:string;userId?:string},saleId:string) {
  await transaction.deviceEvent.create({data:{branchId:input.branchId,unitId,userId:input.userId,kind,note:"Sale lifecycle recorded",saleId}});
  if(kind!=="Sale reserved")await transaction.operation.updateMany({where:{unitId,kind:"PARTNER",partnerDirection:"IN",status:"BORROWED_IN",closedAt:null},data:{status:"PAYABLE",saleId,version:{increment:1}}});
}
export async function unitLandedCost(transaction:Transaction,unitId:string,fallback:number) {
  const unit=await transaction.stockUnit.findUniqueOrThrow({where:{id:unitId},select:{ownership:true}});
  const borrowed=await transaction.operation.findFirst({where:{unitId,kind:"PARTNER",partnerDirection:"IN",closedAt:null},select:{costAmount:true}});
  const purchase=await transaction.expenseEntry.findFirst({where:{unitId,category:"DEVICE_PURCHASE",amount:{gt:0},operationId:null},orderBy:{occurredAt:"desc"}})
    ?? await transaction.expenseEntry.findFirst({where:{unitId,category:"DEVICE_PURCHASE",amount:{gt:0},description:{not:"Borrowed-device supplier settlement"}},orderBy:{occurredAt:"desc"}});
  const costs=await transaction.expenseEntry.aggregate({where:{unitId,category:{in:["REPAIR","FREIGHT"]},...(purchase?{occurredAt:{gte:purchase.occurredAt}}:{})},_sum:{amount:true}});
  const reversed=purchase?await transaction.expenseEntry.findUnique({where:{reversesId:purchase.id}}):null;
  return Math.max(0,(borrowed?.costAmount??(reversed?0:purchase?.amount)??(unit.ownership==="PARTNER"?0:fallback))+(costs._sum.amount??0));
}
export async function snapshotSaleCosts(transaction:Transaction,saleId:string) {
  const lines=await transaction.saleItem.findMany({where:{saleId},include:{stockUnits:{select:{id:true}},product:{select:{costPrice:true}}}});
  for(const line of lines) {
    const totalCost=line.stockUnits.length ? (await Promise.all(line.stockUnits.map(unit=>unitLandedCost(transaction,unit.id,line.product.costPrice)))).reduce((sum,cost)=>sum+cost,0) : line.product.costPrice*line.quantity;
    await transaction.saleItem.update({where:{id:line.id},data:{totalCost,unitCost:Math.floor(totalCost/line.quantity)}});
  }
}
