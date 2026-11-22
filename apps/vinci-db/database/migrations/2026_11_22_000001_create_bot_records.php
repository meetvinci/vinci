<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('types', function (Blueprint $table) {
            $table->string('key', 64)->primary();
        });
        Schema::create('fields', function (Blueprint $table) {
            $table->string('type', 64);
            $table->foreign('type')->references('key')->on('types');
            $table->string('key', 64);
            $table->string('kind', 16);
            $table->primary(['type', 'key']);
        });
        Schema::create('records', function (Blueprint $table) {
            $table->id();
            $table->string('type', 64)->index();
            $table->foreign('type')->references('key')->on('types');
            $table->jsonb('properties');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('records');
        Schema::dropIfExists('fields');
        Schema::dropIfExists('types');
    }
};
