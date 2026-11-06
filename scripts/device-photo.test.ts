import assert from "node:assert/strict";
import test from "node:test";

import { devicePhotoScanText, jsonObjectFromReply, mergeDevicePhotoFields, replyText, type DevicePhotoFields } from "../src/lib/device-photo";
import { parseDeviceScan } from "../src/lib/device-scan";

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

test("a photo reply still fills the form when the model wraps the JSON", () => {
  const raw = jsonObjectFromReply("I can read this screen.\n```json\n{\"modelName\":\"MacBook Neo 13\",\"capacity\":\"256GB\",\"category\":\"Mac\",\"colour\":\"Silver\"}\n```");
  assert.equal(raw.modelName, "MacBook Neo 13");
  assert.equal(replyText([{ type: "text", text: "{\"modelName\":\"iPhone 16\"}" }]), "{\"modelName\":\"iPhone 16\"}");
  const device = parseDeviceScan(devicePhotoScanText({ ...blank, modelName: "MacBook Neo 13", capacity: "256GB", category: "Mac", colour: "Silver", arrival: "new" }));
  assert.equal(device.name, "MacBook Neo 13 256GB");
  assert.equal(device.storage, "256GB");
  assert.equal(device.category, "Mac");
  assert.equal(device.colour, "SILVER");
  const ipad = parseDeviceScan(devicePhotoScanText({ ...blank, modelName: "iPad Air 11", capacity: "128GB", category: "iPad", arrival: "new" }));
  assert.equal(ipad.category, "iPad");
  assert.match(ipad.name, /iPad/);
});
