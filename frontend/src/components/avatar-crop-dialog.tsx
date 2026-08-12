import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/input';
import {
  CROP_CIRCLE_RADIUS,
  CROP_VIEWPORT_SIZE,
  constrainTransform,
  cropImageToBlob,
  defaultCropTransform,
  detectContentBounds,
  imageLayout,
  loadImageFromUrl,
  loadImageSource,
  type CropBounds,
  type CropTransform,
} from '@/lib/avatar-crop';

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

export type AvatarCropResult = {
  cropped: File;
  source: File | null;
  crop: CropTransform;
};

export function AvatarCropDialog({
  open,
  file,
  imageUrl,
  initialTransform,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  /** New local file (upload). */
  file?: File | null;
  /** Existing remote source image URL (edit thumbnail). */
  imageUrl?: string | null;
  initialTransform?: CropTransform | null;
  onCancel: () => void;
  onConfirm: (result: AvatarCropResult) => void | Promise<void>;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(
    null,
  );
  const [contentBounds, setContentBounds] = useState<CropBounds | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [transform, setTransform] = useState<CropTransform>({
    zoom: 1,
    panX: 0,
    panY: 0,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const previewUrlRef = useRef<string | null>(null);

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);

  const applyConstraints = useCallback(
    (next: CropTransform, size = imageSize, bounds = contentBounds) => {
      if (!size || !bounds) return next;
      return constrainTransform(
        size.w,
        size.h,
        bounds,
        next,
        CROP_CIRCLE_RADIUS,
        MAX_ZOOM,
      );
    },
    [imageSize, contentBounds],
  );

  useEffect(() => {
    if (!open || (!file && !imageUrl)) {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      setPreviewUrl(null);
      setImageSize(null);
      setContentBounds(null);
      setSourceFile(null);
      setTransform({ zoom: 1, panX: 0, panY: 0 });
      setError('');
      return;
    }

    let cancelled = false;

    const load = file
      ? loadImageSource(file).then((result) => ({
          ...result,
          source: file as File | null,
        }))
      : loadImageFromUrl(imageUrl!).then((result) => ({
          width: result.width,
          height: result.height,
          src: result.src,
          source: result.file as File | null,
        }));

    void load
      .then(async ({ width, height, src, source }) => {
        if (cancelled) {
          URL.revokeObjectURL(src);
          return;
        }

        if (previewUrlRef.current) {
          URL.revokeObjectURL(previewUrlRef.current);
        }
        previewUrlRef.current = src;

        const bounds = await detectContentBounds(src, width, height);
        if (cancelled) {
          URL.revokeObjectURL(src);
          return;
        }

        setPreviewUrl(src);
        setImageSize({ w: width, h: height });
        setContentBounds(bounds);
        setSourceFile(source);
        const base = initialTransform
          ? constrainTransform(
              width,
              height,
              bounds,
              initialTransform,
              CROP_CIRCLE_RADIUS,
              MAX_ZOOM,
            )
          : defaultCropTransform(width, height, bounds);
        setTransform(base);
        setError('');
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Ошибка загрузки');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, file, imageUrl, initialTransform]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  const updateTransform = useCallback(
    (next: CropTransform) => {
      setTransform(applyConstraints(next));
    },
    [applyConstraints],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!imageSize || !contentBounds || saving) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startPanX: transform.panX,
      startPanY: transform.panY,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !imageSize || !contentBounds) {
      return;
    }
    updateTransform({
      zoom: transform.zoom,
      panX: drag.startPanX + (e.clientX - drag.startX),
      panY: drag.startPanY + (e.clientY - drag.startY),
    });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const onZoomChange = (zoom: number) => {
    updateTransform({ ...transform, zoom });
  };

  const apply = async () => {
    if (!previewUrl || !imageSize || !contentBounds) return;
    setSaving(true);
    setError('');
    try {
      const normalized = applyConstraints(transform);
      const blob = await cropImageToBlob(
        previewUrl,
        normalized,
        sourceFile?.type || 'image/jpeg',
        imageSize.w,
        imageSize.h,
        contentBounds,
      );
      const cropped = new File([blob], 'avatar.jpg', { type: blob.type });
      await onConfirm({
        cropped,
        source: sourceFile,
        crop: normalized,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка обрезки');
    } finally {
      setSaving(false);
    }
  };

  const layout =
    imageSize && contentBounds
      ? imageLayout(imageSize.w, imageSize.h, contentBounds, transform.zoom)
      : null;
  const imgLeft = layout
    ? CROP_VIEWPORT_SIZE / 2 - layout.displayW / 2 + transform.panX
    : 0;
  const imgTop = layout
    ? CROP_VIEWPORT_SIZE / 2 - layout.displayH / 2 + transform.panY
    : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) onCancel();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Обрезка аватара</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Перетащите изображение и увеличьте масштаб. Круг не может выйти за
          пределы фото.
        </p>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <div
          className="relative mx-auto cursor-grab touch-none select-none overflow-hidden rounded-lg bg-muted active:cursor-grabbing"
          style={{ width: CROP_VIEWPORT_SIZE, height: CROP_VIEWPORT_SIZE }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {previewUrl && layout ? (
            <div
              className="absolute overflow-hidden"
              style={{
                left: imgLeft,
                top: imgTop,
                width: layout.displayW,
                height: layout.displayH,
              }}
            >
              <img
                src={previewUrl}
                alt=""
                draggable={false}
                width={imageSize?.w}
                height={imageSize?.h}
                className="block h-full w-full max-w-none select-none"
                style={{ objectFit: 'fill' }}
              />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Загрузка…
            </div>
          )}

          <div
            className="pointer-events-none absolute left-1/2 top-1/2 box-border -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
            style={{
              width: CROP_CIRCLE_RADIUS * 2,
              height: CROP_CIRCLE_RADIUS * 2,
            }}
            aria-hidden
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="avatar-crop-zoom">Масштаб</Label>
          <input
            id="avatar-crop-zoom"
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={transform.zoom}
            disabled={!imageSize || saving}
            className="w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            onChange={(e) => onZoomChange(Number(e.target.value))}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={onCancel}
          >
            Отмена
          </Button>
          <Button
            type="button"
            disabled={!imageSize || saving}
            onClick={() => void apply()}
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
