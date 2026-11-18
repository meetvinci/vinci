import { z } from 'zod';
import { credentialsKey } from './credentials.types';
import { secretName } from './secret.types';

export const mcpSettings = z.object({
  paths: z.array(z.string().trim().min(1).max(4096)).max(50),
});

export const mcpConfigure = mcpSettings.partial();

export const mcpDiscover = z.object({ botId: z.uuid() });

export const mcpCatalogTool = z.object({
  name: z.string(),
  runtimeName: z.string(),
  title: z.string(),
  description: z.string(),
});

export const mcpCatalogServer = z.object({
  name: z.string(),
  description: z.string(),
  source: z.string(),
  transport: z.enum(['stdio', 'http']),
  isEnabled: z.boolean(),
  status: z.enum(['disabled', 'disconnected', 'connecting', 'connected', 'error']),
  auth: z.enum(['none', 'required', 'authorized']),
  isOwned: z.boolean(),
  tools: z.array(mcpCatalogTool),
});

export const mcpServerName = z.string().trim().regex(/^[a-z][a-z0-9-]{0,31}$/);

export const mcpServerAdd = z.object({
  botId: z.uuid(),
  name: mcpServerName,
  url: z.url({ protocol: /^https?$/ }).optional(),
  command: z.string().trim().min(1).max(512).optional(),
  args: z.array(z.string().max(1024)).max(32).optional(),
  headers: z.array(z.object({
    name: z.string().regex(/^[A-Za-z0-9-]{1,64}$/),
    secret: secretName,
    prefix: z.string().max(32).optional(),
  })).max(8).optional(),
  env: z.array(z.object({
    name: z.string().regex(/^[A-Z_][A-Z0-9_]{0,63}$/),
    secret: secretName,
  })).max(8).optional(),
})
  .refine((value) => (value.url === undefined) !== (value.command === undefined), {
    message: 'Provide exactly one of url or command.',
  })
  .refine((value) => value.url !== undefined || value.headers === undefined, {
    message: 'Headers need a url.',
    path: ['headers'],
  })
  .refine((value) => value.command !== undefined || (value.env === undefined && value.args === undefined), {
    message: 'Args and env need a command.',
    path: ['env'],
  });

const mcpFileHeaderName = z.string().regex(/^[A-Za-z0-9-]{1,64}$/);
const mcpFileEnvName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/);
const mcpFileValue = z.string().min(1).max(16384);

const mcpFileCommon = {
  description: z.string().max(1024).optional(),
  enabled: z.boolean().optional(),
  disabled: z.boolean().optional(),
};

export const mcpFileServer = z.union([
  z.strictObject({
    ...mcpFileCommon,
    type: z.literal('http').optional(),
    url: z.url({ protocol: /^https?$/ }),
    headers: z.record(mcpFileHeaderName, mcpFileValue).optional(),
    headerCredentials: z.record(mcpFileHeaderName, credentialsKey).optional(),
  }),
  z.strictObject({
    ...mcpFileCommon,
    type: z.literal('stdio').optional(),
    command: z.string().trim().min(1).max(512),
    args: z.array(z.string().max(1024)).max(32).optional(),
    cwd: z.string().min(1).max(4096).optional(),
    env: z.record(mcpFileEnvName, mcpFileValue).optional(),
    envCredentials: z.record(mcpFileEnvName, credentialsKey).optional(),
  }),
]);

export const mcpFileServers = z.record(mcpServerName, mcpFileServer)
  .refine((servers) => Object.keys(servers).length <= 32, { message: 'validation_mcp_file_count' });

export const mcpFileDocument = z.object({ mcpServers: mcpFileServers });

export const mcpFile = z.object({ mcpServers: z.record(z.string(), z.json()) });

export const mcpReplace = z.object({ botId: z.uuid(), mcpServers: mcpFileServers });

export const mcpServerRemove = z.object({ botId: z.uuid(), name: mcpServerName });

export const mcpOwned = z.object({
  mcpServers: z.record(z.string().min(1).max(128), z.json()),
  credentials: z.record(z.string().min(1).max(256), z.string().min(1).max(16384)),
});

export const mcpShared = z.array(z.object({
  name: z.string(),
  source: z.string(),
}));

export const mcpCatalog = z.object({
  servers: z.array(mcpCatalogServer),
  diagnostics: z.array(z.object({
    source: z.string(),
    server: z.string().optional(),
    message: z.string(),
  })),
});

export type McpSettings = z.infer<typeof mcpSettings>;
export type McpConfigureInput = z.infer<typeof mcpConfigure>;
export type McpCatalog = z.infer<typeof mcpCatalog>;
export type McpShared = z.infer<typeof mcpShared>;
export type McpServerAddInput = z.infer<typeof mcpServerAdd>;
export type McpServerRemoveInput = z.infer<typeof mcpServerRemove>;
export type McpOwned = z.infer<typeof mcpOwned>;
export type McpFile = z.infer<typeof mcpFile>;
export type McpFileServer = z.infer<typeof mcpFileServer>;
export type McpReplaceInput = z.infer<typeof mcpReplace>;
