declare module '@supabase/supabase-js' {
  export function createClient(url: string, key: string, options?: any): any
}

declare module '@google-cloud/secret-manager' {
  export class SecretManagerServiceClient {
    constructor(options?: any)
    accessSecretVersion(request: { name: string }): Promise<Array<{ payload?: { data?: { toString(encoding?: string): string } } }>>
  }
}

declare module 'child_process' {
  export interface ExecException extends Error {
    code?: string | number
    killed?: boolean
    signal?: string
  }

  export function exec(
    command: string,
    callback?: (error: ExecException | null, stdout: string, stderr: string) => void,
  ): any
  export function spawn(command: string, args?: string[], options?: any): any
}
