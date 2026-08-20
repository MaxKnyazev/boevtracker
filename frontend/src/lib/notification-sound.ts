/** Notification sound presets + custom upload (localStorage). */

export const NOTIFICATION_SOUND_STORAGE_KEY =
  'boevtracker.notificationSound';

export type BuiltinSoundId =
  | 'chime'
  | 'bell'
  | 'soft'
  | 'ping'
  | 'chord'
  | 'gav';

export type NotificationSoundId = BuiltinSoundId | 'custom';

export type NotificationSoundPreference = {
  id: NotificationSoundId;
  customName?: string | null;
  /** data: URL for uploaded audio */
  customDataUrl?: string | null;
};

export const BUILTIN_SOUNDS: {
  id: BuiltinSoundId;
  label: string;
  description: string;
}[] = [
  {
    id: 'chime',
    label: 'Мелодия',
    description: 'Классический двухитонный сигнал',
  },
  {
    id: 'bell',
    label: 'Колокольчик',
    description: 'Короткий звон с лёгким эхом',
  },
  {
    id: 'soft',
    label: 'Мягкий',
    description: 'Тихий низкий тон',
  },
  {
    id: 'ping',
    label: 'Пинг',
    description: 'Короткий высокий отклик',
  },
  {
    id: 'chord',
    label: 'Аккорд',
    description: 'Три ноты одновременно',
  },
  {
    id: 'gav',
    label: 'Гав!',
    description: 'Настоящий лай собаки',
  },
];

const DEFAULT_PREFERENCE: NotificationSoundPreference = {
  id: 'chime',
  customName: null,
  customDataUrl: null,
};

const MAX_CUSTOM_BYTES = 512 * 1024;
const ACCEPTED_MIME = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/ogg',
  'audio/webm',
  'audio/mp4',
  'audio/aac',
]);

let audioCtx: AudioContext | null = null;
let customAudio: HTMLAudioElement | null = null;
let sampleAudio: HTMLAudioElement | null = null;

const BUILTIN_SAMPLE_URLS: Partial<Record<BuiltinSoundId, string>> = {
  gav: '/sounds/gav.wav',
};

function getCtx(): AudioContext | null {
  const Ctx =
    typeof window !== 'undefined'
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      : null;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  return audioCtx;
}

export function unlockNotificationAudio() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
}

function isBuiltinId(id: string): id is BuiltinSoundId {
  return BUILTIN_SOUNDS.some((s) => s.id === id);
}

export function readNotificationSoundPreference(): NotificationSoundPreference {
  try {
    const raw = localStorage.getItem(NOTIFICATION_SOUND_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCE };
    const parsed = JSON.parse(raw) as Partial<NotificationSoundPreference>;
    if (parsed.id === 'custom') {
      if (
        typeof parsed.customDataUrl === 'string' &&
        parsed.customDataUrl.startsWith('data:audio/')
      ) {
        return {
          id: 'custom',
          customName:
            typeof parsed.customName === 'string' ? parsed.customName : null,
          customDataUrl: parsed.customDataUrl,
        };
      }
      return { ...DEFAULT_PREFERENCE };
    }
    if (typeof parsed.id === 'string' && isBuiltinId(parsed.id)) {
      return {
        id: parsed.id,
        customName:
          typeof parsed.customName === 'string' ? parsed.customName : null,
        customDataUrl:
          typeof parsed.customDataUrl === 'string'
            ? parsed.customDataUrl
            : null,
      };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_PREFERENCE };
}

export function writeNotificationSoundPreference(
  preference: NotificationSoundPreference,
): void {
  try {
    localStorage.setItem(
      NOTIFICATION_SOUND_STORAGE_KEY,
      JSON.stringify(preference),
    );
  } catch {
    // ignore quota / private mode
  }
}

function playTone(
  ctx: AudioContext,
  freq: number,
  start: number,
  duration: number,
  type: OscillatorType,
  peak = 0.08,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function playSample(url: string, playbackRate = 1) {
  try {
    if (sampleAudio) {
      sampleAudio.pause();
      sampleAudio.currentTime = 0;
    }
    sampleAudio = new Audio(url);
    sampleAudio.volume = 0.9;
    sampleAudio.playbackRate = playbackRate;
    void sampleAudio.play().catch(() => undefined);
  } catch {
    // ignore
  }
}

function playBuiltin(id: BuiltinSoundId) {
  const sampleUrl = BUILTIN_SAMPLE_URLS[id];
  if (sampleUrl) {
    // Slightly higher pitch → closer to a small dog / corgi yap.
    playSample(sampleUrl, id === 'gav' ? 1.18 : 1);
    return;
  }

  const ctx = getCtx();
  if (!ctx) return;

  const run = () => {
    const now = ctx.currentTime;
    switch (id) {
      case 'chime':
        playTone(ctx, 660, now, 0.18, 'sine', 0.08);
        playTone(ctx, 880, now + 0.12, 0.2, 'sine', 0.07);
        break;
      case 'bell':
        playTone(ctx, 880, now, 0.35, 'triangle', 0.07);
        playTone(ctx, 1320, now, 0.28, 'sine', 0.035);
        playTone(ctx, 1760, now + 0.05, 0.22, 'sine', 0.02);
        break;
      case 'soft':
        playTone(ctx, 392, now, 0.4, 'sine', 0.06);
        playTone(ctx, 494, now + 0.08, 0.35, 'sine', 0.04);
        break;
      case 'ping':
        playTone(ctx, 1200, now, 0.12, 'sine', 0.09);
        playTone(ctx, 1600, now + 0.05, 0.1, 'sine', 0.04);
        break;
      case 'chord':
        playTone(ctx, 523.25, now, 0.45, 'sine', 0.05);
        playTone(ctx, 659.25, now, 0.45, 'sine', 0.045);
        playTone(ctx, 783.99, now, 0.45, 'sine', 0.04);
        break;
      case 'gav':
        playSample('/sounds/gav.wav', 1.18);
        break;
    }
  };

  if (ctx.state === 'suspended') {
    void ctx.resume().then(run).catch(() => undefined);
  } else {
    run();
  }
}

function playCustom(dataUrl: string) {
  try {
    if (customAudio) {
      customAudio.pause();
      customAudio.currentTime = 0;
    }
    customAudio = new Audio(dataUrl);
    customAudio.volume = 0.85;
    void customAudio.play().catch(() => undefined);
  } catch {
    // ignore
  }
}

export function playNotificationSound(
  preference: NotificationSoundPreference = readNotificationSoundPreference(),
) {
  unlockNotificationAudio();
  if (preference.id === 'custom' && preference.customDataUrl) {
    playCustom(preference.customDataUrl);
    return;
  }
  const id = isBuiltinId(preference.id) ? preference.id : 'chime';
  playBuiltin(id);
}

export function previewNotificationSound(id: NotificationSoundId) {
  const pref = readNotificationSoundPreference();
  if (id === 'custom') {
    if (pref.customDataUrl) playCustom(pref.customDataUrl);
    return;
  }
  playBuiltin(id);
}

export async function fileToCustomSound(file: File): Promise<{
  name: string;
  dataUrl: string;
}> {
  if (file.size > MAX_CUSTOM_BYTES) {
    throw new Error('Файл слишком большой (макс. 512 КБ)');
  }
  const mime = file.type || 'audio/mpeg';
  if (!ACCEPTED_MIME.has(mime) && !mime.startsWith('audio/')) {
    throw new Error('Поддерживаются MP3, WAV, OGG, WebM');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Не удалось прочитать файл'));
    };
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });

  return { name: file.name, dataUrl };
}

export const CUSTOM_SOUND_ACCEPT =
  'audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/webm,audio/mp4,.mp3,.wav,.ogg,.webm,.m4a';
