import { detectImageType, MAX_IMAGE_BYTES, validateImages } from './product-images';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
const image = (buffer: Buffer, filename = 'photo.jpg') => ({ filename, buffer });

describe('Product image validation', () => {
  it('detects JPEG, PNG and WebP from magic bytes', () => {
    expect(detectImageType(jpeg)?.contentType).toBe('image/jpeg');
    expect(detectImageType(png)?.contentType).toBe('image/png');
    expect(detectImageType(webp)?.contentType).toBe('image/webp');
  });

  it('rejects a non-image even when it is named like one', () => {
    expect(validateImages([image(Buffer.from('MZ fake exe'), 'photo.jpg')])).toBe('"photo.jpg" isn\'t a JPEG, PNG or WebP image.');
  });

  it('requires at least one and at most five photos', () => {
    expect(validateImages([])).toBe('Add at least one product photo.');
    expect(validateImages(Array.from({ length: 6 }, () => image(jpeg)))).toBe('You can upload up to 5 photos.');
    expect(validateImages(Array.from({ length: 5 }, () => image(jpeg)))).toBeNull();
  });

  it('rejects empty and oversized files', () => {
    expect(validateImages([image(Buffer.alloc(0), 'empty.png')])).toBe('"empty.png" is empty.');
    const big = Buffer.concat([jpeg, Buffer.alloc(MAX_IMAGE_BYTES)]);
    expect(validateImages([image(big, 'huge.jpg')])).toBe('"huge.jpg" is larger than 5 MB.');
  });
});
