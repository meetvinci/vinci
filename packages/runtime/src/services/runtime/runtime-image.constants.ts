export const RUNTIME_IMAGE = {
  maxPixels: 3840 * 2160,
  idleMs: 5000,
  jpegFrames: [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf],
  jpegScan: 0xda,
  jpegMaxScans: 100,
  pngSignature: [0x89, 0x50, 0x4e, 0x47],
  gifImage: 0x2c,
  gifExtension: 0x21,
  gifTrailer: 0x3b,
  tooLarge: (width: number, height: number, megapixels: string) => (
    `This image is ${width} x ${height} (${megapixels} megapixels), too large to read: the most is ${(RUNTIME_IMAGE.maxPixels / 1e6).toFixed(1)} megapixels. Resize it first, for example: python3 -m pip install --user pillow && python3 -c "from PIL import Image, ImageOps; i = Image.open('in.jpg'); i.draft('RGB', (2000, 2000)); i = ImageOps.exif_transpose(i); i.thumbnail((2000, 2000)); i.convert('RGB').save('out.jpg', quality=85)", then read the smaller copy.`
  ),
  unknownSize: (mimeType: string) => `This image (${mimeType}) is damaged, built unusually (a JPEG with more than ${RUNTIME_IMAGE.jpegMaxScans} scans) or its size cannot be read, so it was not opened.`,
} as const;
