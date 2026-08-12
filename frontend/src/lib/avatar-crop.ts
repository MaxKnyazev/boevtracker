const OUTPUT_SIZE = 512;

export const CROP_VIEWPORT_SIZE = 280;
export const CROP_CIRCLE_RADIUS = 120;

export type CropTransform = {
  /** Multiplier on top of baseScale (1 = minimum allowed scale). */
  zoom: number;
  /** Image center offset from viewport center, px. */
  panX: number;
  panY: number;
};

export type CropBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ImageLayout = {
  displayW: number;
  displayH: number;
  scale: number;
  minScale: number;
};

export function fullBounds(imageWidth: number, imageHeight: number): CropBounds {
  return { x: 0, y: 0, width: imageWidth, height: imageHeight };
}

/** Minimum scale so the crop circle fits inside the given bounds. */
export function minScaleForBounds(
  bounds: CropBounds,
  circleRadius = CROP_CIRCLE_RADIUS,
): number {
  if (bounds.width <= 0 || bounds.height <= 0) return 1;
  const diameter = circleRadius * 2;
  return Math.max(diameter / bounds.width, diameter / bounds.height);
}

/** Base scale: image fits in viewport, but never below minScaleForBounds. */
export function baseScaleForImage(
  imageWidth: number,
  imageHeight: number,
  bounds: CropBounds,
  circleRadius = CROP_CIRCLE_RADIUS,
  viewportSize = CROP_VIEWPORT_SIZE,
): number {
  const minScale = minScaleForBounds(bounds, circleRadius);
  if (imageWidth <= 0 || imageHeight <= 0) return minScale;
  const containScale = Math.min(
    viewportSize / imageWidth,
    viewportSize / imageHeight,
  );
  return Math.max(minScale, containScale);
}

export function imageLayout(
  imageWidth: number,
  imageHeight: number,
  bounds: CropBounds,
  zoom: number,
  circleRadius = CROP_CIRCLE_RADIUS,
  viewportSize = CROP_VIEWPORT_SIZE,
): ImageLayout {
  const minScale = baseScaleForImage(
    imageWidth,
    imageHeight,
    bounds,
    circleRadius,
    viewportSize,
  );
  const scale = minScale * Math.max(1, zoom);
  return {
    displayW: imageWidth * scale,
    displayH: imageHeight * scale,
    scale,
    minScale,
  };
}

export function defaultCropTransform(
  imageWidth: number,
  imageHeight: number,
  bounds: CropBounds,
  circleRadius = CROP_CIRCLE_RADIUS,
  viewportSize = CROP_VIEWPORT_SIZE,
): CropTransform {
  const { scale } = imageLayout(
    imageWidth,
    imageHeight,
    bounds,
    1,
    circleRadius,
    viewportSize,
  );
  const contentCenterX = bounds.x + bounds.width / 2;
  const contentCenterY = bounds.y + bounds.height / 2;

  return {
    zoom: 1,
    panX: (imageWidth / 2 - contentCenterX) * scale,
    panY: (imageHeight / 2 - contentCenterY) * scale,
  };
}

export function constrainTransform(
  imageWidth: number,
  imageHeight: number,
  bounds: CropBounds,
  transform: CropTransform,
  circleRadius = CROP_CIRCLE_RADIUS,
  maxZoom = 3,
  viewportSize = CROP_VIEWPORT_SIZE,
): CropTransform {
  if (imageWidth <= 0 || imageHeight <= 0 || bounds.width <= 0 || bounds.height <= 0) {
    return { zoom: 1, panX: 0, panY: 0 };
  }

  let zoom = Math.max(1, transform.zoom);
  let layout = imageLayout(
    imageWidth,
    imageHeight,
    bounds,
    zoom,
    circleRadius,
    viewportSize,
  );
  const diameter = circleRadius * 2;

  while (
    (layout.displayW < diameter || layout.displayH < diameter) &&
    zoom < maxZoom
  ) {
    zoom = Math.min(maxZoom, zoom + 0.01);
    layout = imageLayout(
      imageWidth,
      imageHeight,
      bounds,
      zoom,
      circleRadius,
      viewportSize,
    );
  }

  const { scale } = layout;
  const minPanX =
    (imageWidth / 2 - bounds.x - bounds.width) * scale + circleRadius;
  const maxPanX = (imageWidth / 2 - bounds.x) * scale - circleRadius;
  const minPanY =
    (imageHeight / 2 - bounds.y - bounds.height) * scale + circleRadius;
  const maxPanY = (imageHeight / 2 - bounds.y) * scale - circleRadius;

  if (minPanX > maxPanX || minPanY > maxPanY) {
    return { zoom, panX: 0, panY: 0 };
  }

  return {
    zoom,
    panX: clamp(transform.panX, minPanX, maxPanX),
    panY: clamp(transform.panY, minPanY, maxPanY),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export async function loadImageSource(
  file: File,
): Promise<{ width: number; height: number; src: string }> {
  const src = URL.createObjectURL(file);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
        src,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(src);
      reject(new Error('Не удалось загрузить изображение'));
    };
    img.src = src;
  });
}

export async function loadImageFromUrl(
  url: string,
): Promise<{ width: number; height: number; src: string; file: File }> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    throw new Error('Не удалось загрузить изображение');
  }
  const blob = await res.blob();
  const file = new File([blob], 'avatar-source.jpg', {
    type: blob.type || 'image/jpeg',
  });
  const src = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
        src,
        file,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(src);
      reject(new Error('Не удалось загрузить изображение'));
    };
    img.src = src;
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не удалось загрузить изображение'));
    img.src = src;
  });
}

/** Detect non-transparent pixel bounds so the crop stays on visible content. */
export async function detectContentBounds(
  src: string,
  imageWidth: number,
  imageHeight: number,
): Promise<CropBounds> {
  const img = await loadImage(src);
  const iw = img.naturalWidth || imageWidth;
  const ih = img.naturalHeight || imageHeight;
  if (iw <= 0 || ih <= 0) return fullBounds(imageWidth, imageHeight);

  const canvas = document.createElement('canvas');
  canvas.width = iw;
  canvas.height = ih;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return fullBounds(iw, ih);

  ctx.drawImage(img, 0, 0, iw, ih);
  const { data } = ctx.getImageData(0, 0, iw, ih);

  let minX = iw;
  let minY = ih;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < ih; y++) {
    for (let x = 0; x < iw; x++) {
      const alpha = data[(y * iw + x) * 4 + 3];
      if (alpha > 16) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return fullBounds(iw, ih);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function cropSourceRect(
  imageWidth: number,
  imageHeight: number,
  bounds: CropBounds,
  transform: CropTransform,
  circleRadius = CROP_CIRCLE_RADIUS,
  viewportSize = CROP_VIEWPORT_SIZE,
) {
  const { scale } = imageLayout(
    imageWidth,
    imageHeight,
    bounds,
    transform.zoom,
    circleRadius,
    viewportSize,
  );
  const { panX, panY } = constrainTransform(
    imageWidth,
    imageHeight,
    bounds,
    transform,
    circleRadius,
    3,
    viewportSize,
  );

  const centerX = imageWidth / 2 - panX / scale;
  const centerY = imageHeight / 2 - panY / scale;
  const sourceSize = (circleRadius * 2) / scale;

  let sx = centerX - sourceSize / 2;
  let sy = centerY - sourceSize / 2;

  sx = clamp(sx, bounds.x, bounds.x + bounds.width - sourceSize);
  sy = clamp(sy, bounds.y, bounds.y + bounds.height - sourceSize);
  sx = clamp(sx, 0, Math.max(0, imageWidth - sourceSize));
  sy = clamp(sy, 0, Math.max(0, imageHeight - sourceSize));

  return { sx, sy, sourceSize, scale, panX, panY };
}

function flattenCircleAlpha(ctx: CanvasRenderingContext2D, size: number): void {
  const { data } = ctx.getImageData(0, 0, size, size);
  const center = size / 2;
  const radiusSq = center * center;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - center;
      const dy = y + 0.5 - center;
      const i = (y * size + x) * 4;
      if (dx * dx + dy * dy <= radiusSq && data[i + 3]! > 0) {
        data[i + 3] = 255;
      }
    }
  }

  ctx.putImageData(new ImageData(data, size, size), 0, 0);
}

/** Renders the circular crop region to a square image blob. */
export async function cropImageToBlob(
  imageSrc: string,
  transform: CropTransform,
  _mimeType: string,
  imageWidth: number,
  imageHeight: number,
  bounds: CropBounds,
  circleRadius = CROP_CIRCLE_RADIUS,
): Promise<Blob> {
  const img = await loadImage(imageSrc);
  const iw = img.naturalWidth || imageWidth;
  const ih = img.naturalHeight || imageHeight;
  const normalized = constrainTransform(iw, ih, bounds, transform, circleRadius);
  const { sx, sy, sourceSize } = cropSourceRect(
    iw,
    ih,
    bounds,
    normalized,
    circleRadius,
  );

  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas недоступен');

  ctx.beginPath();
  ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  // Slight overscan so anti-aliased clip edge stays fully opaque.
  const bleed = 1.04;
  const inset = (OUTPUT_SIZE * (1 - bleed)) / 2;
  ctx.drawImage(
    img,
    sx,
    sy,
    sourceSize,
    sourceSize,
    inset,
    inset,
    OUTPUT_SIZE * bleed,
    OUTPUT_SIZE * bleed,
  );

  flattenCircleAlpha(ctx, OUTPUT_SIZE);

  // JPEG keeps avatars fully opaque — no colored fringe from avatarColor behind.
  const outputMime = 'image/jpeg';
  const quality = 0.92;

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Не удалось обработать изображение'));
      },
      outputMime,
      quality,
    );
  });
}

export function isCircleInsideImage(
  imageWidth: number,
  imageHeight: number,
  bounds: CropBounds,
  transform: CropTransform,
  circleRadius = CROP_CIRCLE_RADIUS,
  viewportSize = CROP_VIEWPORT_SIZE,
): boolean {
  const { scale } = imageLayout(
    imageWidth,
    imageHeight,
    bounds,
    transform.zoom,
    circleRadius,
    viewportSize,
  );
  const centerX = imageWidth / 2 - transform.panX / scale;
  const centerY = imageHeight / 2 - transform.panY / scale;
  const r = circleRadius / scale;

  return (
    centerX - r >= bounds.x &&
    centerX + r <= bounds.x + bounds.width &&
    centerY - r >= bounds.y &&
    centerY + r <= bounds.y + bounds.height
  );
}
