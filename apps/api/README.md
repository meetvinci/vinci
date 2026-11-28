# Vinci API

The Laravel API starts with the main Vinci Docker stack as the `api` service.
Laravel connects to the `vinci` PostgreSQL database over the internal `api` network. The stack
keeps its data in the `postgres-data` volume.
`GET /` returns HTTP 200 with the body `ok`. The image uses this route for its health check.
The image runs the migrations at every start, before Apache.

This app is the install's login: the
`/auth/*` pages, Sanctum tokens as logins in the `vinci_session` cookie, the hub's `/internal/session`
(check a login, change one's own password) and `/internal/users/*` routes, and `php artisan vinci:user`.
See "Login with Vinci accounts" in `docs/install/install.md` and `.agents/references/team-workspace.md`.

Build the image from the repository root with `bun run build:images api`.
On an installed stack, check the route with:

```sh
docker compose exec -T api php -r 'echo file_get_contents("http://127.0.0.1:8080/");'
```

Set `VINCI_DB_API_TOKEN` in the stack environment to enable authenticated entity requests. The API runs pending migrations before serving HTTP.

## HTTP API

Use the `/api` prefix, `Authorization: Bearer <token>`, and JSON bodies. The health endpoint is `/`. Type keys, field keys and relation labels start with a lowercase letter and contain up to 64 lowercase letters, digits and underscores.

### Define the schema

| Method and path | Input or result |
|---|---|
| POST /entity-types | `{"key":"person","label":"Person","plural_label":"People","icon":"user"}`. Labels default to the key. |
| GET /entity-types | List types by key. |
| GET /entity-types/{type} | Read the type with its ordered fields. |
| PATCH /entity-types/{type} | Edit labels or icon. |
| DELETE /entity-types/{type} | Remove an empty type. Active or archived entities and relation fields on other types that target it prevent deletion. |
| POST /entity-types/{type}/fields | Create a field with a key, kind, optional label, required flag and kind-specific settings. |
| PATCH /entity-types/{type}/fields/{key} | Edit label, required flag or settings. Field keys and kinds are immutable. |
| PUT /entity-types/{type}/fields/order | Supply every field key once in `{"keys":["employer","city"]}`. |
| DELETE /entity-types/{type}/fields/{key} | Remove the definition. Stored properties and relation rows survive. |

Scalar kinds are `text`, `number`, `boolean`, `date` (YYYY-MM-DD), `datetime` (ISO timestamp including seconds and timezone), and `url` (HTTP or HTTPS). For `select` and `multi_select`, supply ordered `settings.options`, e.g. `[{"value":"open","label":"Open","color":"green"}]`. Entities store option values. Field additions and schema changes validate existing data, including archived entities.

### Connect Ada to Acme

The following calls assume empty tables and use the IDs returned by the two entity creates.

| Method and path | JSON body |
|---|---|
| POST /entity-types | `{"key":"company"}` |
| POST /entity-types | `{"key":"person"}` |
| POST /entity-types/person/fields | `{"key":"employer","kind":"relation","settings":{"label":"works_at","direction":"outgoing","target_type":"company","many":false}}` |
| POST /entity-types/company/fields | `{"key":"employees","kind":"relation","settings":{"label":"works_at","direction":"incoming","target_type":"person","many":true}}` |
| POST /entities | `{"type":"company","name":"Acme"}` |
| POST /entities | `{"type":"person","name":"Ada","related":{"employer":1}}` |
| POST /entities/query | `{"type":"person","related":{"entity_id":1,"label":"works_at","direction":"outgoing"}}` |

Reading Acme now returns `related.employees: [2]`. Repeating the connection through `POST /relations` with `{"from_entity_id":2,"label":"works_at","to_entity_id":1}` returns the same relation. Either direction's field enforces its target type and cardinality. Labels without a field can also connect two entities.

### Work with entities and relations

| Method and path | Behavior |
|---|---|
| GET /entities or POST /entities/query | Returns up to 50 rows in `data`, with `page` and `next_page` (null at the end). Repeat the query with `page` set to `next_page`. Supply `page`, `type`, `sort` (id, name or property key), and `order` (asc or desc). POST also accepts a `properties` object of exact JSON values and a `related` filter as above. Direction is relative to the result entity. |
| GET /entities/{id} | Read name, type, properties and related IDs by field key. |
| PATCH /entities/{id} | Patch name, properties and related fields together. Unspecified keys retain their values. A single relation takes an ID or null. A many relation takes an array of IDs. Setting a field replaces its links. |
| DELETE /entities/{id} | Hide the entity and all incident relations. |
| POST /entities/{id}/restore | Restore the same ID and retained links whose other endpoint is visible. Hidden links still count toward field cardinality. |
| GET /relations | Paginate visible links. Filter by label or entity_id, optionally with incoming or outgoing direction relative to that ID. |
| GET /relations/{id} | Read endpoints, label and properties. |
| POST /relations | Connect two active entities. An existing pair with the same label returns its original ID. Optional properties merge by key. |
| PATCH /relations/{id} | Merge supplied properties by key. |
| DELETE /relations/{id} | Disconnect the endpoints unless a required field depends on the link. |

Extra entity properties retain their JSON values. Defining a field for an extra key validates its existing values before exposing it as a field. Schema, entity and relation writes each commit atomically.

### PostgreSQL storage

Each entity type has a physical table in the `entity` schema. For example, defining the `invoice` type with a `due_date` date field and an `amount` number field creates `entity.invoice` with `due_date date` and `amount numeric`. The immutable API keys determine the SQL names. SQL keywords are quoted. A 64-character key uses a hashed SQL name to fit PostgreSQL’s 63-byte limit. Field names occupied by Vinci or PostgreSQL gain a leading underscore, for example `entity_id` becomes `_entity_id`. Changing a display label leaves the table or column name intact.

```sql
SELECT e.id, e.name, i.due_date, i.amount
FROM entity.invoice AS i
JOIN entities AS e ON e.id = i.entity_id
WHERE e.deleted_at IS NULL AND i.due_date < CURRENT_DATE
ORDER BY i.amount DESC;
```

The shared `entities` row holds identity, type, name, deletion state and extra JSON properties. Each type row references an entity of that type. Declared scalar fields use native columns, multi-select uses `text[]`, and relation fields use the shared `relations` table. A type row retains enough formatting information to return supplied timestamp spellings and distinguish an explicit null from an omitted property.

Adding a field validates and moves existing extra values into its column. Removing the field moves those values back before dropping the column. Both operations include archived rows and commit atomically. Schema changes and writes take an exclusive application lock, so a large field conversion can delay other API requests. Each new type has at most 1,597 scalar field slots. PostgreSQL counts dropped columns toward that limit until the table is rebuilt. Relation fields use no column slots.
