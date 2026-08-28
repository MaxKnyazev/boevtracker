<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('documentation_products', function (Blueprint $table) {
            $table->id();
            $table->string('name', 255);
            $table->text('description')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->foreignId('created_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('documentation_chapters', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained('documentation_products')->cascadeOnDelete();
            $table->string('title', 255);
            $table->longText('body')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('help_notes', function (Blueprint $table) {
            $table->id();
            $table->string('title', 255);
            $table->longText('body')->nullable();
            $table->boolean('pinned')->default(false);
            $table->unsignedInteger('sort_order')->default(0);
            $table->foreignId('created_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::table('attachments', function (Blueprint $table) {
            $table->foreignId('documentation_product_id')
                ->nullable()
                ->after('comment_id')
                ->constrained('documentation_products')
                ->cascadeOnDelete();
            $table->foreignId('documentation_chapter_id')
                ->nullable()
                ->after('documentation_product_id')
                ->constrained('documentation_chapters')
                ->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('attachments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('documentation_chapter_id');
            $table->dropConstrainedForeignId('documentation_product_id');
        });
        Schema::dropIfExists('help_notes');
        Schema::dropIfExists('documentation_chapters');
        Schema::dropIfExists('documentation_products');
    }
};
