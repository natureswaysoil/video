export class SecretManagerServiceClient {
  constructor(options?: any)
  accessSecretVersion(request: { name: string }): Promise<Array<{ payload?: { data?: { toString(encoding?: string): string } } }>>
}
