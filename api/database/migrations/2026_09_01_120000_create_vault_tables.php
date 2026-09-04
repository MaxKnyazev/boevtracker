<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('services', function (Blueprint $table) {
            $table->id();
            $table->string('name', 150);
            $table->string('url', 500)->nullable();
            $table->timestamps();
            $table->unique('name');
        });

        Schema::create('vault_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('service_id')->constrained('services')->cascadeOnDelete();
            $table->foreignId('owner_user_id')->nullable()->constrained('users')->cascadeOnDelete();
            $table->string('account', 100)->default('');
            $table->string('login', 255);
            $table->text('password_encrypted');
            $table->string('level', 100)->nullable();
            $table->timestamps();

            $table->unique(['service_id', 'account', 'owner_user_id'], 'vault_items_service_account_owner_unique');
            $table->index('owner_user_id');
        });

        Schema::create('role_base_items', function (Blueprint $table) {
            $table->string('tracker_role', 32);
            $table->foreignId('vault_item_id')->constrained('vault_items')->cascadeOnDelete();
            $table->primary(['tracker_role', 'vault_item_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('role_base_items');
        Schema::dropIfExists('vault_items');
        Schema::dropIfExists('services');
    }
};
