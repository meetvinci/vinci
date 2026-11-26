<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            // Always lowercase: the hub compares emails in lowercase.
            $table->string('email')->unique();
            $table->string('name')->nullable();
            $table->string('password');
            $table->timestamps();
        });
    }
};
