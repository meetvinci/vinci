# vinci-db

One standalone Compose project runs a Laravel HTTP API and PostgreSQL with a persistent volume. Every bot uses the same API token and sees the same records.

## Run

For a fresh install, run these commands from this directory. The first command creates a private credentials file and fails if one already exists.

```sh
(umask 077; set -C; printf 'POSTGRES_PASSWORD=%s\nVINCI_DB_PASSWORD=%s\nAPP_KEY=base64:%s\nVINCI_DB_API_TOKEN=%s\n' "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" "$(openssl rand -base64 32)" "$(openssl rand -hex 32)" > .env)
docker compose --env-file .env -f ../../deploy/compose/vinci-db.yaml up -d --build --wait
```

Laravel runs pending migrations on startup.

Give the bot the API base URL and VINCI_DB_API_TOKEN. The default base URL is `http://127.0.0.1:55433/api` on the database host. For remote access, put the API behind HTTPS and supply that URL. VINCI_DB_API_BIND and VINCI_DB_API_PORT control the published interface and port. A deployed Vinci sandbox needs a route and firewall permission to reach its destination. PostgreSQL is internal to the Compose project.

## API

Send `Authorization: Bearer <token>` with every API request and `Content-Type: application/json` with JSON bodies. Keys start with a lowercase letter and contain up to 64 lowercase letters, digits or underscores.

| Method and path (under /api) | Body or behavior |
|---|---|
| POST /types | `{"key":"customer"}` |
| GET /types | List shared types |
| POST /types/customer/fields | `{"key":"city","kind":"text"}`. Supported kinds are text, number and boolean. All fields are optional. |
| GET /types/customer/fields | List field definitions |
| POST /types/customer/records | `{"properties":{"city":"Berlin"}}`. Returns the record and its id. |
| GET /types/customer/records | List 50 per page. Use page=2 for the next page, or field=city&value=Berlin to filter by exact field value. |
| GET /types/customer/records/1 | Get one record |
| PATCH /types/customer/records/1 | `{"properties":{"city":"Hamburg"}}` merges the supplied fields. |
| DELETE /types/customer/records/1 | Delete one record |

Duplicate type or field keys return 409. Invalid field names or values in a record return 422. The public health endpoint is /up.
