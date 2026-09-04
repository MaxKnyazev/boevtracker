import { FormEvent, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { Copy, Eye, EyeOff, KeyRound, Plus } from 'lucide-react';
import {
  api,
  type Role,
  type VaultCredential,
  type VaultCredentialInput,
} from '@/lib/api';
import { canManageUsers, useAuthStore } from '@/store/auth';
import { EmptyState, PageHeader } from '@/components/layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { ROLE_LABELS, cn } from '@/lib/utils';

const SETS: Role[] = ['DEVELOPER', 'READER', 'ADMIN'];

type EditorState = {
  id?: number;
  kind: 'personal' | 'base';
  service: string;
  role: string;
  login: string;
  password: string;
  baseRoles: Role[];
};

const emptyEditor = (kind: EditorState['kind'], service = '', baseRoles: Role[] = []): EditorState => ({
  kind,
  service,
  role: '',
  login: '',
  password: '',
  baseRoles,
});

export function VaultPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = canManageUsers(user?.role);
  const [items, setItems] = useState<VaultCredential[]>([]);
  const [baseItems, setBaseItems] = useState<VaultCredential[]>([]);
  const [selectedSet, setSelectedSet] = useState<Role>('DEVELOPER');
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  const load = async () => {
    setLoading(true);
    try {
      if (isAdmin) {
        const base = await api.vaultBaseCredentials();
        setBaseItems(base.credentials);
      } else {
        const data = await api.vaultCredentials();
        setItems(data.credentials);
      }
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [isAdmin]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!editor) return;
    setSaving(true);
    setError('');
    const body: VaultCredentialInput = {
      service: editor.service.trim(),
      role: editor.role.trim(),
      login: editor.login.trim(),
      kind: editor.kind,
    };
    if (editor.password) body.password = editor.password;
    if (editor.kind === 'base') body.baseRoles = editor.baseRoles;
    try {
      if (!editor.service.trim() || !editor.role.trim() || !editor.login.trim()) {
        setError('Укажите сервис, роль и логин.');
        setSaving(false);
        return;
      }
      if (editor.kind === 'base' && editor.baseRoles.length === 0) {
        setError('Выберите хотя бы один набор.');
        setSaving(false);
        return;
      }
      if (!editor.id && !editor.password) {
        setError('Укажите пароль');
        setSaving(false);
        return;
      }
      if (editor.id) {
        await api.updateVaultCredential(editor.id, body);
      } else {
        await api.createVaultCredential({ ...body, password: editor.password });
      }
      setEditor(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: VaultCredential) => {
    if (!confirm('Удалить запись?')) return;
    try {
      await api.deleteVaultCredential(item.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка удаления');
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setError('Не удалось скопировать');
    }
  };

  if (isAdmin) {
    return (
      <AdminSets
        items={baseItems}
        selectedSet={selectedSet}
        onSelectSet={setSelectedSet}
        query={query}
        onQuery={setQuery}
        error={error}
        loading={loading}
        editor={editor}
        setEditor={setEditor}
        saving={saving}
        revealed={revealed}
        setRevealed={setRevealed}
        onSave={(e) => void save(e)}
        onRemove={(item) => void remove(item)}
        onCopy={(value) => void copy(value)}
      />
    );
  }

  return (
    <PersonalVault
      items={items}
      selectedService={selectedService}
      onSelectService={setSelectedService}
      query={query}
      onQuery={setQuery}
      error={error}
      loading={loading}
      editor={editor}
      setEditor={setEditor}
      saving={saving}
      revealed={revealed}
      setRevealed={setRevealed}
      onSave={(e) => void save(e)}
      onRemove={(item) => void remove(item)}
      onCopy={(value) => void copy(value)}
    />
  );
}

function AdminSets({
  items,
  selectedSet,
  onSelectSet,
  query,
  onQuery,
  error,
  loading,
  editor,
  setEditor,
  saving,
  revealed,
  setRevealed,
  onSave,
  onRemove,
  onCopy,
}: {
  items: VaultCredential[];
  selectedSet: Role;
  onSelectSet: (role: Role) => void;
  query: string;
  onQuery: (value: string) => void;
  error: string;
  loading: boolean;
  editor: EditorState | null;
  setEditor: (value: EditorState | null) => void;
  saving: boolean;
  revealed: Record<number, boolean>;
  setRevealed: Dispatch<SetStateAction<Record<number, boolean>>>;
  onSave: (e: FormEvent) => void;
  onRemove: (item: VaultCredential) => void;
  onCopy: (value: string) => void;
}) {
  const inSet = useMemo(
    () => items.filter((item) => item.baseRoles.includes(selectedSet)),
    [items, selectedSet],
  );

  const groups = useMemo(() => groupByService(inSet, query), [inSet, query]);

  return (
    <div>
      <PageHeader
        title="Пароли"
        description="Базовые наборы по ролям трекера. Новый сотрудник с этой ролью сразу видит сервисы набора."
        actions={
          <Button type="button" onClick={() => setEditor(emptyEditor('base', '', [selectedSet]))}>
            <Plus className="h-4 w-4" />
            Добавить в набор
          </Button>
        }
      />

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">Загрузка...</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
          <aside className="overflow-hidden rounded-xl border border-border bg-card">
            {SETS.map((role) => {
              const count = items.filter((item) => item.baseRoles.includes(role)).length;
              return (
                <button
                  key={role}
                  type="button"
                  className={cn(
                    'flex w-full items-center justify-between border-b border-border px-3 py-2.5 text-left text-sm last:border-b-0',
                    selectedSet === role ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
                  )}
                  onClick={() => onSelectSet(role)}
                >
                  <span>{ROLE_LABELS[role]}</span>
                  <span className={cn('text-xs', selectedSet === role ? 'opacity-80' : 'text-muted-foreground')}>
                    {count}
                  </span>
                </button>
              );
            })}
          </aside>

          <section className="space-y-4">
            <Input
              placeholder="Поиск сервиса"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
            />
            {groups.length === 0 ? (
              <EmptyState
                title={`Набор «${ROLE_LABELS[selectedSet]}» пуст`}
                description="Добавьте сервис, роль и пароль. Сотрудник с этой ролью увидит их сразу после подтверждения."
                icon={<KeyRound className="h-10 w-10" />}
              />
            ) : (
              groups.map((group) => (
                <div key={group.name} className="space-y-3">
                  <div>
                    <h2 className="text-sm font-semibold">{group.name}</h2>
                  </div>
                  {group.items.map((item) => (
                    <CredentialCard
                      key={item.id}
                      item={item}
                      canEdit
                      showSets
                      revealed={!!revealed[item.id]}
                      onToggle={() =>
                        setRevealed((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                      }
                      onCopy={onCopy}
                      onEdit={() => setEditor(toEditor(item))}
                      onRemove={() => onRemove(item)}
                    />
                  ))}
                </div>
              ))
            )}
          </section>
        </div>
      )}

      <EditorDialog
        editor={editor}
        setEditor={setEditor}
        saving={saving}
        error={error}
        onSave={onSave}
      />
    </div>
  );
}

function PersonalVault({
  items,
  selectedService,
  onSelectService,
  query,
  onQuery,
  error,
  loading,
  editor,
  setEditor,
  saving,
  revealed,
  setRevealed,
  onSave,
  onRemove,
  onCopy,
}: {
  items: VaultCredential[];
  selectedService: string | null;
  onSelectService: (value: string | null) => void;
  query: string;
  onQuery: (value: string) => void;
  error: string;
  loading: boolean;
  editor: EditorState | null;
  setEditor: (value: EditorState | null) => void;
  saving: boolean;
  revealed: Record<number, boolean>;
  setRevealed: Dispatch<SetStateAction<Record<number, boolean>>>;
  onSave: (e: FormEvent) => void;
  onRemove: (item: VaultCredential) => void;
  onCopy: (value: string) => void;
}) {
  const services = useMemo(() => {
    const names = new Map<string, string>();
    for (const item of items) {
      if (!names.has(item.service)) names.set(item.service, item.service);
    }
    const q = query.trim().toLowerCase();
    return [...names.values()]
      .filter((name) => !q || name.toLowerCase().includes(q))
      .sort((a, b) => a.localeCompare(b, 'ru'));
  }, [items, query]);

  useEffect(() => {
    if (selectedService && !services.includes(selectedService)) {
      onSelectService(services[0] ?? null);
    }
    if (!selectedService && services[0]) onSelectService(services[0]);
  }, [services, selectedService, onSelectService]);

  const visible = items.filter((item) => item.service === selectedService);

  return (
    <div>
      <PageHeader
        title="Пароли"
        description="Личные записи и базовый набор вашей роли. Базовые пароли правит только администратор."
        actions={
          <Button type="button" onClick={() => setEditor(emptyEditor('personal', selectedService ?? ''))}>
            <Plus className="h-4 w-4" />
            В личное
          </Button>
        }
      />

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">Загрузка...</p>
      ) : services.length === 0 ? (
        <EmptyState
          title="Пока пусто"
          description="Добавьте личный пароль. Базовые сервисы появятся, когда администратор заполнит набор вашей роли."
          icon={<KeyRound className="h-10 w-10" />}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
          <aside className="space-y-3">
            <Input placeholder="Поиск сервиса" value={query} onChange={(e) => onQuery(e.target.value)} />
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              {services.map((service) => (
                <button
                  key={service}
                  type="button"
                  className={cn(
                    'block w-full border-b border-border px-3 py-2.5 text-left text-sm last:border-b-0',
                    selectedService === service ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
                  )}
                  onClick={() => onSelectService(service)}
                >
                  {service}
                </button>
              ))}
            </div>
          </aside>
          <section className="space-y-3">
            {visible.map((item) => (
              <CredentialCard
                key={item.id}
                item={item}
                canEdit={item.kind === 'personal'}
                revealed={!!revealed[item.id]}
                onToggle={() => setRevealed((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                onCopy={onCopy}
                onEdit={() => setEditor(toEditor(item))}
                onRemove={() => onRemove(item)}
              />
            ))}
          </section>
        </div>
      )}

      <EditorDialog
        editor={editor}
        setEditor={setEditor}
        saving={saving}
        error={error}
        onSave={onSave}
      />
    </div>
  );
}

function EditorDialog({
  editor,
  setEditor,
  saving,
  error,
  onSave,
}: {
  editor: EditorState | null;
  setEditor: (value: EditorState | null) => void;
  saving: boolean;
  error: string;
  onSave: (e: FormEvent) => void;
}) {
  return (
    <Dialog open={!!editor} onOpenChange={(open) => !open && setEditor(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editor?.id
              ? 'Изменить запись'
              : editor?.kind === 'base'
                ? 'Сервис в набор'
                : 'Личная запись'}
          </DialogTitle>
        </DialogHeader>
        {editor && (
          <form className="space-y-3" onSubmit={onSave}>
            <div>
              <Label htmlFor="vault-service">Сервис</Label>
              <Input
                id="vault-service"
                className="mt-1.5"
                value={editor.service}
                onChange={(e) => setEditor({ ...editor, service: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="vault-role">Роль</Label>
              <Input
                id="vault-role"
                className="mt-1.5"
                placeholder="ftp, root, админка"
                value={editor.role}
                onChange={(e) => setEditor({ ...editor, role: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="vault-login">Логин</Label>
              <Input
                id="vault-login"
                className="mt-1.5"
                value={editor.login}
                onChange={(e) => setEditor({ ...editor, login: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="vault-password">Пароль</Label>
              <Input
                id="vault-password"
                type="password"
                className="mt-1.5"
                placeholder={editor.id ? 'Оставьте пустым, чтобы не менять' : ''}
                value={editor.password}
                onChange={(e) => setEditor({ ...editor, password: e.target.value })}
                required={!editor.id}
              />
            </div>
            {editor.kind === 'base' && (
              <div>
                <div className="mb-2 text-sm font-medium">Наборы</div>
                <div className="flex flex-wrap gap-3">
                  {SETS.map((role) => {
                    const checked = editor.baseRoles.includes(role);
                    return (
                      <label key={role} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setEditor({
                              ...editor,
                              baseRoles: checked
                                ? editor.baseRoles.filter((r) => r !== role)
                                : [...editor.baseRoles, role],
                            })
                          }
                        />
                        {ROLE_LABELS[role]}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditor(null)}>
                Отмена
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Сохранение…' : 'Сохранить'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CredentialCard({
  item,
  canEdit,
  showSets,
  revealed,
  onToggle,
  onCopy,
  onEdit,
  onRemove,
}: {
  item: VaultCredential;
  canEdit: boolean;
  showSets?: boolean;
  revealed: boolean;
  onToggle: () => void;
  onCopy: (value: string) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {!showSets &&
          (item.kind === 'base' ? (
            <Badge>Базовый</Badge>
          ) : (
            <Badge>Личное</Badge>
          ))}
        {!showSets && item.role && <Badge>{item.role}</Badge>}
        {showSets &&
          item.baseRoles.map((role) => (
            <Badge key={role}>{ROLE_LABELS[role] ?? role}</Badge>
          ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SecretRow label="Логин" value={item.login} onCopy={() => onCopy(item.login)} />
        <SecretRow
          label="Пароль"
          value={item.password}
          hidden={!revealed}
          onToggle={onToggle}
          onCopy={() => onCopy(item.password)}
        />
      </div>
      {canEdit && (
        <div className="mt-4 flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            Изменить
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={onRemove}
          >
            Удалить
          </Button>
        </div>
      )}
    </article>
  );
}

function toEditor(item: VaultCredential): EditorState {
  return {
    id: item.id,
    kind: item.kind,
    service: item.service,
    role: item.role,
    login: item.login,
    password: '',
    baseRoles: item.baseRoles.filter((role): role is Role => SETS.includes(role)),
  };
}

function groupByService(items: VaultCredential[], query: string) {
  const q = query.trim().toLowerCase();
  const map = new Map<string, { name: string; items: VaultCredential[] }>();
  for (const item of items) {
    if (q && !item.service.toLowerCase().includes(q)) continue;
    const group = map.get(item.service) ?? { name: item.service, items: [] };
    group.items.push(item);
    map.set(item.service, group);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

function SecretRow({
  label,
  value,
  hidden,
  onToggle,
  onCopy,
}: {
  label: string;
  value: string;
  hidden?: boolean;
  onToggle?: () => void;
  onCopy: () => void;
}) {
  return (
    <div>
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div className="flex items-center gap-1">
        <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-2 py-1.5 text-sm">
          {hidden ? '••••••••' : value}
        </code>
        {onToggle && (
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onToggle}>
            {hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </Button>
        )}
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onCopy}>
          <Copy className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
