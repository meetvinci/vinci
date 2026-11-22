\getenv bot_password VINCI_DB_PASSWORD
CREATE ROLE bot LOGIN PASSWORD :'bot_password';
CREATE DATABASE bots OWNER bot;
