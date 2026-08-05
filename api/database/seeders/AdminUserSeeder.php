<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class AdminUserSeeder extends Seeder
{
    public function run(): void
    {
        User::query()->updateOrCreate(
            ['username' => 'admin'],
            [
                'password_hash' => Hash::make('admin123'),
                'first_name' => 'Admin',
                'last_name' => 'User',
                'avatar_color' => '#3B82F6',
                'role' => 'ADMIN',
            ]
        );
    }
}
