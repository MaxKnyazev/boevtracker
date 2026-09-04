<?php

namespace App\Http\Controllers;

use App\Models\Credential;
use App\Models\RoleBaseItem;
use App\Models\Service;
use App\Models\User;
use App\Support\Constants;
use Illuminate\Database\QueryException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class CredentialController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidPending($user)) {
            return $resp;
        }

        $items = $this->visibleQuery($user)
            ->orderBy('id')
            ->get()
            ->map(fn (Credential $credential) => $credential->toApiArray())
            ->values();

        return response()->json(['credentials' => $items]);
    }

    public function services(Request $request): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidPending($user)) {
            return $resp;
        }

        $services = $this->visibleQuery($user)
            ->get()
            ->map(fn (Credential $credential) => $credential->service)
            ->filter()
            ->unique('id')
            ->sortBy(fn (Service $service) => mb_strtolower($service->name))
            ->values()
            ->map(fn (Service $service) => $service->toApiArray());

        return response()->json(['services' => $services]);
    }

    public function byService(Request $request, string $service): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidPending($user)) {
            return $resp;
        }

        $model = $this->findService($service);
        if ($model === null) {
            return response()->json(['error' => 'Сервис не найден'], 404);
        }

        $items = $this->visibleQuery($user)
            ->where('service_id', $model->id)
            ->orderByRaw('owner_user_id is null')
            ->orderBy('account')
            ->get()
            ->map(fn (Credential $credential) => $credential->toApiArray())
            ->values();

        return response()->json([
            'service' => $model->toApiArray(),
            'credentials' => $items,
        ]);
    }

    public function baseIndex(Request $request): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidPending($user)) {
            return $resp;
        }
        if (! $user->canManageUsers()) {
            return response()->json(['error' => 'Недостаточно прав'], 403);
        }

        $items = Credential::query()
            ->with(['service', 'roleLinks'])
            ->whereNull('owner_user_id')
            ->orderBy('id')
            ->get()
            ->map(fn (Credential $credential) => $credential->toApiArray())
            ->values();

        return response()->json(['credentials' => $items]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidPending($user)) {
            return $resp;
        }

        $kind = $request->input('kind', Credential::KIND_PERSONAL);
        if ($kind === Credential::KIND_BASE) {
            if (! $user->canManageUsers()) {
                return response()->json(['error' => 'Недостаточно прав'], 403);
            }

            return $this->storeBase($request);
        }

        return $this->storePersonal($request, $user);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidPending($user)) {
            return $resp;
        }

        $credential = $this->findVisible($user, $id);
        if ($credential === null) {
            return response()->json(['error' => 'Запись не найдена'], 404);
        }

        return response()->json(['credential' => $credential->toApiArray()]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidPending($user)) {
            return $resp;
        }

        $credential = Credential::query()->with(['service', 'roleLinks'])->find($id);
        if ($credential === null || ! $this->canMutate($user, $credential)) {
            return response()->json(['error' => 'Запись не найдена'], 404);
        }

        $data = $this->validated($request, passwordRequired: false);
        if ($data instanceof JsonResponse) {
            return $data;
        }

        $service = $this->findOrCreateService($data['service'], $data['url'] ?? null);
        $kind = $credential->kind();

        if ($this->findDuplicate(
            $service->id,
            $data['account'],
            $kind,
            $kind === Credential::KIND_PERSONAL ? $user->id : null,
            $credential->id,
        )) {
            return response()->json(['error' => $this->duplicateMessage($data['account'])], 409);
        }

        $credential->service_id = $service->id;
        $credential->account = $data['account'];
        $credential->level = $data['level'];
        $credential->login = $data['login'];
        
        if ($data['password'] !== null && $data['password'] !== '') {
            $credential->setPlainPassword($data['password']);
        }
        $credential->save();

        if ($credential->isBase()) {
            $roles = $this->normalizeBaseRoles($request->input('baseRoles', $credential->trackerRoles()));
            if ($roles instanceof JsonResponse) {
                return $roles;
            }
            $this->syncBaseRoles($credential, $roles);
        }

        $credential->load(['service', 'roleLinks']);

        return response()->json(['credential' => $credential->toApiArray()]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidPending($user)) {
            return $resp;
        }

        $credential = Credential::query()->find($id);
        if ($credential === null || ! $this->canMutate($user, $credential)) {
            return response()->json(['error' => 'Запись не найдена'], 404);
        }

        $credential->delete();

        return response()->json(['ok' => true]);
    }

    private function storePersonal(Request $request, User $user): JsonResponse
    {
        $data = $this->validated($request, passwordRequired: true);
        if ($data instanceof JsonResponse) {
            return $data;
        }

        $service = $this->findOrCreateService($data['service'], $data['url'] ?? null);

        if ($this->findDuplicate($service->id, $data['account'], Credential::KIND_PERSONAL, $user->id, null)) {
            return response()->json(['error' => $this->duplicateMessage($data['account'])], 409);
        }

        $credential = new Credential([
            'service_id' => $service->id,
            'owner_user_id' => $user->id,
            'account' => $data['account'],
            'level' => $data['level'],
            'login' => $data['login'],
        ]);
        $credential->setPlainPassword($data['password']);
        try {
            $credential->save();
        } catch (QueryException) {
            return response()->json(['error' => $this->duplicateMessage($data['account'])], 409);
        }
        $credential->load(['service', 'roleLinks']);

        return response()->json(['credential' => $credential->toApiArray()], 201);
    }

    private function storeBase(Request $request): JsonResponse
    {
        $data = $this->validated($request, passwordRequired: true);
        if ($data instanceof JsonResponse) {
            return $data;
        }

        $roles = $this->normalizeBaseRoles($request->input('baseRoles'));
        if ($roles instanceof JsonResponse) {
            return $roles;
        }

        $service = $this->findOrCreateService($data['service'], $data['url'] ?? null);
        $existing = $this->findDuplicate($service->id, $data['account'], Credential::KIND_BASE, null, null);
        if ($existing !== null) {
            $existing->loadMissing('roleLinks');
            $merged = array_values(array_unique([...$existing->trackerRoles(), ...$roles]));
            $this->syncBaseRoles($existing, $merged);
            $existing->load(['service', 'roleLinks']);

            return response()->json(['credential' => $existing->toApiArray()]);
        }

        $credential = new Credential([
            'service_id' => $service->id,
            'owner_user_id' => null,
            'account' => $data['account'],
            'level' => $data['level'],
            'login' => $data['login'],
        ]);
        $credential->setPlainPassword($data['password']);
        try {
            $credential->save();
        } catch (QueryException) {
            return response()->json(['error' => $this->duplicateMessage($data['account'])], 409);
        }
        $this->syncBaseRoles($credential, $roles);
        $credential->load(['service', 'roleLinks']);

        return response()->json(['credential' => $credential->toApiArray()], 201);
    }

    private function visibleQuery(User $user)
    {
        return Credential::query()
            ->with(['service', 'roleLinks'])
            ->where(function ($query) use ($user) {
                $query->where('owner_user_id', $user->id)
                    ->orWhere(function ($base) use ($user) {
                        $base->whereNull('owner_user_id')
                            ->whereHas('roleLinks', function ($links) use ($user) {
                                $links->where('tracker_role', $user->role);
                            });
                    });
            });
    }

    private function findVisible(User $user, int $id): ?Credential
    {
        $credential = Credential::query()->with(['service', 'roleLinks'])->find($id);
        if ($credential === null || ! $this->canView($user, $credential)) {
            return null;
        }

        return $credential;
    }

    private function canView(User $user, Credential $credential): bool
    {
        if (! $credential->isBase()) {
            return (int) $credential->owner_user_id === (int) $user->id;
        }

        if ($user->canManageUsers()) {
            return true;
        }

        $credential->loadMissing('roleLinks');

        return in_array($user->role, $credential->trackerRoles(), true);
    }

    private function canMutate(User $user, Credential $credential): bool
    {
        if (! $credential->isBase()) {
            return (int) $credential->owner_user_id === (int) $user->id;
        }

        return $user->canManageUsers();
    }

    /** @param list<string> $roles */
    private function syncBaseRoles(Credential $credential, array $roles): void
    {
        $credential->roleLinks()->delete();
        foreach ($roles as $role) {
            RoleBaseItem::query()->create([
                'tracker_role' => $role,
                'vault_item_id' => $credential->id,
            ]);
        }
        $credential->unsetRelation('roleLinks');
        $credential->load('roleLinks');
    }

    private function validated(Request $request, bool $passwordRequired): array|JsonResponse
    {
        $rules = [
            'service' => ['required', 'string', 'max:150'],
            'url' => ['nullable', 'string', 'max:500'],
            'role' => ['required', 'string', 'min:1', 'max:100'],
            'level' => ['nullable', 'string', 'max:100'],
            'login' => ['required', 'string', 'max:255'],
            'password' => [$passwordRequired ? 'required' : 'nullable', 'string'],
        ];

        $validator = Validator::make($request->all(), $rules);
        if ($validator->fails()) {
            return response()->json(['error' => $validator->errors()->toArray()], 400);
        }

        $data = $validator->validated();
        $data['service'] = trim($data['service']);
        $data['account'] = trim((string) ($data['role'] ?? ''));
        if ($data['account'] === '') {
            return response()->json(['error' => 'Укажите роль — у каждой свой логин и пароль'], 400);
        }
        $data['level'] = isset($data['level']) && trim((string) $data['level']) !== ''
            ? trim((string) $data['level'])
            : null;
        $data['login'] = trim($data['login']);
        $data['url'] = isset($data['url']) && trim((string) $data['url']) !== ''
            ? trim((string) $data['url'])
            : null;
        $data['password'] = $data['password'] ?? null;

        return $data;
    }

    /** @return list<string>|JsonResponse */
    private function normalizeBaseRoles(mixed $input): array|JsonResponse
    {
        if (! is_array($input) || $input === []) {
            return response()->json(['error' => 'Укажите роли трекера для базовой записи'], 400);
        }

        $allowed = Constants::VAULT_BASE_ROLES;
        $roles = [];
        foreach ($input as $role) {
            $role = strtoupper(trim((string) $role));
            if (! in_array($role, $allowed, true)) {
                return response()->json(['error' => 'Некорректная роль для базового набора'], 400);
            }
            $roles[] = $role;
        }

        return array_values(array_unique($roles));
    }

    private function findDuplicate(
        int $serviceId,
        string $account,
        string $kind,
        ?int $userId,
        ?int $exceptId,
    ): ?Credential {
        $query = Credential::query()->where('service_id', $serviceId);

        if ($kind === Credential::KIND_PERSONAL) {
            $query->where('owner_user_id', $userId);
        } else {
            $query->whereNull('owner_user_id');
        }

        if ($exceptId !== null) {
            $query->where('id', '!=', $exceptId);
        }

        $needle = mb_strtolower($account);

        return $query->get()->first(
            fn (Credential $credential) => mb_strtolower($credential->account) === $needle
        );
    }

    private function duplicateMessage(string $account): string
    {
        return $account === ''
            ? 'Запись для этого сервиса уже есть'
            : 'Запись для этого сервиса и аккаунта уже есть';
    }

    private function findOrCreateService(string $name, ?string $url): Service
    {
        $service = $this->findService($name);
        if ($service === null) {
            try {
                $service = Service::query()->create([
                    'name' => $name,
                    'url' => $url,
                ]);
            } catch (UniqueConstraintViolationException) {
                $service = $this->findService($name);
                if ($service === null) {
                    throw new \RuntimeException('Не удалось найти сервис');
                }
            }
        }

        if ($url !== null && $service->url !== $url) {
            $service->url = $url;
            $service->save();
        }

        return $service;
    }

    private function findService(string $name): ?Service
    {
        $exact = Service::query()->where('name', $name)->first();
        if ($exact !== null) {
            return $exact;
        }

        $needle = mb_strtolower($name);

        return Service::query()
            ->get()
            ->first(fn (Service $service) => mb_strtolower($service->name) === $needle);
    }
}
