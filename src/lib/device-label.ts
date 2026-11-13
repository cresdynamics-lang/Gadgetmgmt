import {QRCodeWriter,BarcodeFormat} from "@zxing/library";
import {jsPDF} from "jspdf";
export function createDeviceLabel(name:string,identifier:string) {
  if(!identifier || identifier.length>100)throw new Error("A unique device identifier is required.");
  const matrix=new QRCodeWriter().encode(identifier,BarcodeFormat.QR_CODE,160,160,new Map());
  const doc=new jsPDF({unit:"mm",format:[58,40],orientation:"landscape"});
  doc.setFontSize(8);doc.setFont("helvetica","bold");doc.text("GadgetHub · Device",3,5);
  doc.setFont("helvetica","normal");doc.setFontSize(7);doc.text(doc.splitTextToSize(name,27).slice(0,2),3,10);
  const size=23;const cell=size/matrix.getWidth();
  doc.setFillColor(0,0,0);
  for(let y=0;y<matrix.getHeight();y++)for(let x=0;x<matrix.getWidth();x++)if(matrix.get(x,y))doc.rect(31+x*cell,7+y*cell,cell,cell,"F");
  doc.setFontSize(7);doc.text(identifier,3,35,{maxWidth:51});
  return doc;
}
