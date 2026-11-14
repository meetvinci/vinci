export interface RuntimeBotFilesFolder {
  descriptor: number;
  path: string;
  base: string;
}

export interface RuntimeBotFilesWriteOptions {
  mode: number;
  isExclusive?: boolean;
}
