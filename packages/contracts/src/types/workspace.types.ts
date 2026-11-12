import { z } from 'zod';

export const WORKSPACE = {
  maxFiles: 2000,
  maxBytes: 6 * 1024 * 1024,
  maxPath: 1024,
} as const;

const workspacePath = z.string().min(1).max(WORKSPACE.maxPath)
  .refine((path) => !path.startsWith('/') && path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..'), { message: 'validation_workspace_path' });

export const workspaceFile = z.object({
  path: workspacePath,
  content: z.base64(),
  isExecutable: z.boolean(),
});

export const workspaceFiles = z.object({ files: z.array(workspaceFile).max(WORKSPACE.maxFiles) });
export const workspaceImportResult = z.void();

export type WorkspaceFile = z.infer<typeof workspaceFile>;
export type WorkspaceFiles = z.infer<typeof workspaceFiles>;
