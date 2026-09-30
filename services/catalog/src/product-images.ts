export const MAX_PRODUCT_IMAGES = 5;
export const MIN_PRODUCT_IMAGES = 1;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface UploadedImage {
  filename: string;
  buffer: Buffer;
}

export interface DetectedImage {
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  extension: 'jpg' | 'png' | 'webp';
}

/**
 * Identifies the image type from the file's magic bytes. The client-supplied
 * Content-Type and file extension are never trusted — they're trivially
 * spoofed — so a renamed executable can't be stored as a "photo".
 */
export function detectImageType(buffer: Buffer): DetectedImage | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { contentType: 'image/jpeg', extension: 'jpg' };
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { contentType: 'image/png', extension: 'png' };
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return { contentType: 'image/webp', extension: 'webp' };
  }
  return null;
}

/** Returns a field-error message for the image set, or null when it's valid. */
export function validateImages(images: UploadedImage[]): string | null {
  if (images.length < MIN_PRODUCT_IMAGES) return 'Add at least one product photo.';
  if (images.length > MAX_PRODUCT_IMAGES) return `You can upload up to ${MAX_PRODUCT_IMAGES} photos.`;
  for (const image of images) {
    if (image.buffer.length === 0) return `"${image.filename}" is empty.`;
    if (image.buffer.length > MAX_IMAGE_BYTES) return `"${image.filename}" is larger than 5 MB.`;
    if (!detectImageType(image.buffer)) return `"${image.filename}" isn't a JPEG, PNG or WebP image.`;
  }
  return null;
}
