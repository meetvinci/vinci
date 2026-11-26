<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

// The login was a signed JWT until Sanctum sessions replaced it: the signing keys go.
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('signing_keys');
    }
};
