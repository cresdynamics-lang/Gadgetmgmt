import { BinaryBitmap, ChecksumException, FormatException, HybridBinarizer, MultiFormatReader, NotFoundException, RGBLuminanceSource } from "@zxing/library";

// These proportions also define the guide drawn over the object-cover preview.
export const SCAN_GUIDE = { width: 0.8, height: 0.4 };

export function scanRegion(videoWidth: number, videoHeight: number, previewWidth: number, previewHeight: number) {
  if ([videoWidth, videoHeight, previewWidth, previewHeight].some((value) => !Number.isFinite(value) || value <= 0)) return null;
  const scale = Math.max(previewWidth / videoWidth, previewHeight / videoHeight);
  const width = previewWidth / scale * SCAN_GUIDE.width;
  const height = previewHeight / scale * SCAN_GUIDE.height;
  return { x: (videoWidth - width) / 2, y: (videoHeight - height) / 2, width, height };
}

export function createBarcodeDecoder() {
  const reader = new MultiFormatReader();
  reader.setHints();
  return (image: Pick<ImageData, "data" | "width" | "height">) => {
    const luminance = new Uint8ClampedArray(image.width * image.height);
    for (let i = 0; i < luminance.length; i += 1) {
      const offset = i * 4;
      luminance[i] = (image.data[offset] + 2 * image.data[offset + 1] + image.data[offset + 2]) / 4;
    }
    try {
      const result = reader.decodeWithState(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance, image.width, image.height))));
      return { value: result.getText(), format: result.getBarcodeFormat() };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ChecksumException || error instanceof FormatException) return null;
      throw error;
    } finally {
      reader.reset();
    }
  };
}
