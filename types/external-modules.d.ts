declare module '@supabase/supabase-js' {
  export function createClient(url: string, key: string, options?: any): any
}

declare module '@google-cloud/secret-manager' {
  export class SecretManagerServiceClient {
    constructor(options?: any)
    accessSecretVersion(request: { name: string }): Promise<Array<{ payload?: { data?: { toString(encoding?: string): string } } }>>
  }
}
