<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('signing_keys', function (Blueprint $table) {
            $table->id();
            $table->string('kid')->unique();
            // The RSA private key in PEM, encrypted with APP_KEY.
            $table->text('private_key');
            $table->timestamps();
        });
    }
};
