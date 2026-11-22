FROM composer:2 AS composer
FROM php:8.4-apache
RUN apt-get update && apt-get install -y --no-install-recommends libpq-dev libonig-dev unzip \
    && docker-php-ext-install pdo_pgsql mbstring && rm -rf /var/lib/apt/lists/*
COPY --from=composer /usr/bin/composer /usr/local/bin/composer
WORKDIR /var/www/html
COPY composer.json composer.lock ./
RUN composer install --no-dev --prefer-dist --no-interaction
COPY . .
RUN mkdir -p bootstrap/cache storage/framework/views storage/logs \
    && chown -R www-data:www-data bootstrap/cache storage \
    && sed -i 's|DocumentRoot /var/www/html|DocumentRoot /var/www/html/public|' /etc/apache2/sites-available/000-default.conf \
    && printf '<Directory /var/www/html/public>\nSetEnvIf Authorization "(.*)" HTTP_AUTHORIZATION=$1\nFallbackResource /index.php\nOptions -Indexes\n</Directory>\n' > /etc/apache2/conf-enabled/vinci-db.conf
CMD ["sh", "-ec", "su -s /bin/sh www-data -c 'php artisan migrate --force' && exec apache2-foreground"]
