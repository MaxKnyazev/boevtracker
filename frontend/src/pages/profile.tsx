import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Crop, ImagePlus, Play, Trash2, Upload } from 'lucide-react';
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
import {
  BUILTIN_SOUNDS,
  CUSTOM_SOUND_ACCEPT,
  fileToCustomSound,
  playNotificationSound,
  previewNotificationSound,
  readNotificationSoundPreference,
  unlockNotificationAudio,
  writeNotificationSoundPreference,
  type BuiltinSoundId,
  type NotificationSoundPreference,
} from '@/lib/notification-sound';

function notificationSoundLabel(pref: NotificationSoundPreference): string {
  if (pref.id === 'custom') {
    return pref.customName?.trim() || 'Свой файл';
  }
  return BUILTIN_SOUNDS.find((s) => s.id === pref.id)?.label ?? 'Мелодия';
}

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
  const [soundPref, setSoundPref] = useState<NotificationSoundPreference>(() =>
    readNotificationSoundPreference(),
  );
  const [soundError, setSoundError] = useState('');
  const [soundOpen, setSoundOpen] = useState(false);
  const soundInputRef = useRef<HTMLInputElement>(null);

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

  const saveSoundPreference = (next: NotificationSoundPreference) => {
    setSoundPref(next);
    writeNotificationSoundPreference(next);
    setSoundError('');
  };

  const selectBuiltinSound = (id: BuiltinSoundId) => {
    unlockNotificationAudio();
    saveSoundPreference({
      ...soundPref,
      id,
    });
    previewNotificationSound(id);
  };

  const selectCustomSound = () => {
    if (!soundPref.customDataUrl) {
      soundInputRef.current?.click();
      return;
    }
    unlockNotificationAudio();
    saveSoundPreference({
      ...soundPref,
      id: 'custom',
    });
    previewNotificationSound('custom');
  };

  const onCustomSoundSelected = async (file: File | undefined) => {
    if (!file) return;
    setSoundError('');
    try {
      const { name, dataUrl } = await fileToCustomSound(file);
      unlockNotificationAudio();
      const next: NotificationSoundPreference = {
        id: 'custom',
        customName: name,
        customDataUrl: dataUrl,
      };
      saveSoundPreference(next);
      playNotificationSound(next);
    } catch (err) {
      setSoundError(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      if (soundInputRef.current) soundInputRef.current.value = '';
    }
  };

  const clearCustomSound = () => {
    const next: NotificationSoundPreference = {
      id: soundPref.id === 'custom' ? 'chime' : soundPref.id,
      customName: null,
      customDataUrl: null,
    };
    saveSoundPreference(next);
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
        description="Имя, цвет, фото и звук уведомлений"
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
                        'relative h-8 w-8 cursor-pointer rounded-full border-2 transition-transform hover:scale-105',
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

      <section className="mb-6 overflow-hidden rounded-xl border border-border bg-card">
        <button
          type="button"
          className="flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-4 text-left"
          aria-expanded={soundOpen}
          onClick={() => setSoundOpen((v) => !v)}
        >
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Звук уведомлений</h2>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              Сейчас: {notificationSoundLabel(soundPref)}
            </p>
          </div>
          <ChevronDown
            className={cn(
              'h-5 w-5 shrink-0 text-muted-foreground transition-transform',
              soundOpen && 'rotate-180',
            )}
          />
        </button>
        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-300 ease-out',
            soundOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="border-t border-border px-5 pb-5 pt-4">
              <p className="mb-4 text-xs text-muted-foreground">
                Выберите один из готовых звуков или загрузите свой файл. Выбор
                сохранится на этом устройстве.
              </p>

              <div className="space-y-2">
                {BUILTIN_SOUNDS.map((sound) => {
                  const active = soundPref.id === sound.id;
                  return (
                    <div
                      key={sound.id}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors',
                        active
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-accent/40',
                      )}
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 cursor-pointer text-left"
                        onClick={() => selectBuiltinSound(sound.id)}
                      >
                        <div className="text-sm font-medium">{sound.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {sound.description}
                        </div>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        title="Прослушать"
                        onClick={() => {
                          unlockNotificationAudio();
                          previewNotificationSound(sound.id);
                        }}
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}

                <div
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors',
                    soundPref.id === 'custom'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-accent/40',
                  )}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 cursor-pointer text-left"
                    onClick={selectCustomSound}
                  >
                    <div className="text-sm font-medium">Свой файл</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {soundPref.customName
                        ? soundPref.customName
                        : 'MP3, WAV, OGG или WebM, до 512 КБ'}
                    </div>
                  </button>
                  <input
                    ref={soundInputRef}
                    type="file"
                    accept={CUSTOM_SOUND_ACCEPT}
                    className="hidden"
                    onChange={(e) =>
                      void onCustomSoundSelected(e.target.files?.[0])
                    }
                  />
                  {soundPref.customDataUrl ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        title="Прослушать"
                        onClick={() => {
                          unlockNotificationAudio();
                          previewNotificationSound('custom');
                        }}
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        title="Заменить файл"
                        onClick={() => soundInputRef.current?.click()}
                      >
                        <Upload className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                        title="Удалить свой звук"
                        onClick={clearCustomSound}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => soundInputRef.current?.click()}
                    >
                      <Upload className="h-4 w-4" />
                      Загрузить
                    </Button>
                  )}
                </div>
              </div>

              {soundError && (
                <p className="mt-3 text-sm text-destructive" role="alert">
                  {soundError}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

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
