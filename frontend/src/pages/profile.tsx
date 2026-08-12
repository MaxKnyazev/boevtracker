import { useEffect, useRef, useState } from 'react';
import { Crop, ImagePlus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { AVATAR_COLORS } from '@/lib/avatar-colors';
import { useAuthStore } from '@/store/auth';
import { PageHeader } from '@/components/layout';
import {
  AvatarCropDialog,
  type AvatarCropResult,
} from '@/components/avatar-crop-dialog';
import { UserAvatar } from '@/components/user-avatar';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { ROLE_LABELS, cn } from '@/lib/utils';
import type { CropTransform } from '@/lib/avatar-crop';

type CropSession =
  | { mode: 'upload'; file: File }
  | {
      mode: 'edit';
      imageUrl: string;
      initialTransform: CropTransform | null;
    };

function resolveMediaUrl(path?: string | null): string | null {
  if (!path) return null;
  const apiUrl = String(import.meta.env.VITE_API_URL ?? '').trim();
  return apiUrl ? `${apiUrl}${path}` : path;
}

export function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [avatarColor, setAvatarColor] = useState('#3B82F6');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cropSession, setCropSession] = useState<CropSession | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [usedColors, setUsedColors] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName);
    setLastName(user.lastName);
    setAvatarColor(user.avatarColor);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void api
      .assignableUsers()
      .then(({ users }) => {
        if (cancelled) return;
        const colors = new Set(
          users
            .filter((u) => u.id !== user.id)
            .map((u) => u.avatarColor.toUpperCase()),
        );
        setUsedColors(colors);
      })
      .catch(() => {
        if (!cancelled) setUsedColors(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const previewUser = user
    ? {
        ...user,
        firstName,
        lastName,
        avatarColor,
      }
    : null;

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { user: updated } = await api.updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        avatarColor,
      });
      setUser(updated);
      setSuccess('Изменения сохранены');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const onAvatarSelected = (file: File | undefined) => {
    if (!file) return;
    setError('');
    setSuccess('');
    setCropSession({ mode: 'upload', file });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openEditThumbnail = () => {
    if (!user?.avatarUrl) return;
    const imageUrl =
      resolveMediaUrl(user.avatarSourceUrl) ||
      resolveMediaUrl(user.avatarUrl);
    if (!imageUrl) return;
    setError('');
    setSuccess('');
    setCropSession({
      mode: 'edit',
      imageUrl,
      initialTransform: user.avatarCrop ?? null,
    });
  };

  const uploadCroppedAvatar = async (result: AvatarCropResult) => {
    setUploading(true);
    setError('');
    setSuccess('');
    try {
      const { user: updated } = await api.uploadProfileAvatar({
        cropped: result.cropped,
        source: result.source,
        crop: result.crop,
      });
      setUser(updated);
      setAvatarColor(updated.avatarColor);
      setCropSession(null);
      setSuccess('Аватар обновлён');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setUploading(false);
    }
  };

  const removeAvatar = async () => {
    if (!user?.avatarUrl) return;
    setUploading(true);
    setError('');
    setSuccess('');
    try {
      const { user: updated } = await api.deleteProfileAvatar();
      setUser(updated);
      setSuccess('Аватар удалён');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка удаления');
    } finally {
      setUploading(false);
    }
  };

  if (!user) return null;

  const nameDirty =
    firstName.trim() !== user.firstName ||
    lastName.trim() !== user.lastName ||
    avatarColor !== user.avatarColor;

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Личный кабинет"
        description="Имя, цвет и фото профиля"
      />

      {error && (
        <p className="mb-4 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="mb-4 text-sm text-emerald-600 dark:text-emerald-400" role="status">
          {success}
        </p>
      )}

      <section className="mb-6 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold">Аватар</h2>
        <div className="flex flex-wrap items-start gap-5">
          <UserAvatar user={previewUser} size="xl" />
          <div className="min-w-0 flex-1 space-y-4">
            <div>
              <Label className="mb-2 block">Цвет</Label>
              <div className="flex flex-wrap gap-2">
                {AVATAR_COLORS.map((color) => {
                  const taken = usedColors.has(color.toUpperCase());
                  return (
                    <button
                      key={color}
                      type="button"
                      title={
                        taken
                          ? 'Этот цвет уже использует другой пользователь'
                          : color
                      }
                      aria-label={
                        taken
                          ? `Цвет ${color}, уже используется другим пользователем`
                          : `Цвет ${color}`
                      }
                      className={cn(
                        'relative h-8 w-8 rounded-full border-2 transition-transform hover:scale-105',
                        avatarColor === color
                          ? 'border-foreground ring-2 ring-ring ring-offset-2 ring-offset-background'
                          : 'border-transparent',
                      )}
                      style={{ backgroundColor: color }}
                      onClick={() => setAvatarColor(color)}
                    >
                      {taken && (
                        <span
                          className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold leading-none text-white shadow-sm ring-1 ring-background"
                          aria-hidden
                        >
                          !
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={(e) => onAvatarSelected(e.target.files?.[0])}
              />
              {user.avatarUrl ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={uploading}
                    onClick={openEditThumbnail}
                  >
                    <Crop className="h-4 w-4" />
                    {uploading ? 'Загрузка…' : 'Изменить миниатюру'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={uploading}
                    onClick={() => void removeAvatar()}
                  >
                    <Trash2 className="h-4 w-4" />
                    Удалить фото
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus className="h-4 w-4" />
                  {uploading ? 'Загрузка…' : 'Загрузить фото'}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              JPEG, PNG, GIF или WebP, до 5 МБ. После выбора файла можно обрезать
              круглую область.
            </p>
          </div>
        </div>
      </section>

      <AvatarCropDialog
        open={cropSession !== null}
        file={cropSession?.mode === 'upload' ? cropSession.file : null}
        imageUrl={cropSession?.mode === 'edit' ? cropSession.imageUrl : null}
        initialTransform={
          cropSession?.mode === 'edit' ? cropSession.initialTransform : null
        }
        onCancel={() => setCropSession(null)}
        onConfirm={uploadCroppedAvatar}
      />

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold">Профиль</h2>
        <div className="space-y-4">
          <div>
            <Label htmlFor="profile-username">Логин</Label>
            <Input
              id="profile-username"
              value={user.username}
              disabled
              className="mt-1.5"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="profile-first-name">Имя</Label>
              <Input
                id="profile-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1.5"
                maxLength={64}
              />
            </div>
            <div>
              <Label htmlFor="profile-last-name">Фамилия</Label>
              <Input
                id="profile-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="mt-1.5"
                maxLength={64}
              />
            </div>
          </div>
          <div>
            <Label>Роль</Label>
            <Input
              value={ROLE_LABELS[user.role]}
              disabled
              className="mt-1.5"
            />
          </div>
          <Button
            type="button"
            disabled={saving || !nameDirty}
            onClick={() => void saveProfile()}
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </div>
      </section>
    </div>
  );
}
