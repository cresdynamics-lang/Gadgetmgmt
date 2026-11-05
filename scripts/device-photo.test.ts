import assert from "node:assert/strict";
import test from "node:test";

import { devicePhotoScanText, mergeDevicePhotoFields, type DevicePhotoFields } from "../src/lib/device-photo";

const blank: DevicePhotoFields = {
  modelName: "", modelNumber: "", partNumber: "", serial: "", imei: "", capacity: "",
  colour: "", version: "", batteryHealth: "", simLock: "", findMy: "", category: "", quantity: "", chip: "", arrival: "",
};

test("photos of About and a sticker fill each other's blanks", () => {
  const merged = mergeDevicePhotoFields([
    { ...blank, modelName: "iPhone 14", modelNumber: "A2649", capacity: "128GB" },
    { ...blank, imei: "358250492399182", serial: "V2WT716GVM", colour: "Midnight", batteryHealth: "87" },
  ]);
  assert.equal(merged.modelName, "iPhone 14");
  assert.equal(merged.imei, "358250492399182");
  assert.equal(merged.colour, "Midnight");
  assert.match(devicePhotoScanText(merged), /IMEI 358250492399182/);
  assert.match(devicePhotoScanText(merged), /Color Midnight/);
  assert.match(devicePhotoScanText(merged), /Battery 87%/);
  const secondPass = mergeDevicePhotoFields([merged, { ...blank, modelName: "Wrong", colour: "Blue", batteryHealth: "" }]);
  assert.equal(secondPass.modelName, "iPhone 14");
  assert.equal(secondPass.colour, "Midnight");
  assert.match(devicePhotoScanText({ ...blank, modelName: "Case for iPhone 17e", colour: "Black", category: "Apple accessories", quantity: "4" }), /Accessory Case for iPhone 17e/);
  const chip = mergeDevicePhotoFields([
    { ...blank, modelName: "MacBook Air 13", category: "Mac" },
    { ...blank, chip: "M2", batteryHealth: "91" },
  ]);
  assert.equal(chip.modelName, "MacBook Air 13");
  assert.equal(chip.chip, "M2");
  assert.match(devicePhotoScanText(chip), /MacBook Air 13 M2/);
  assert.match(devicePhotoScanText({ ...blank, modelName: "iPad", chip: "A16", arrival: "ex-uk" }), /Arrival ex-uk/);
});
