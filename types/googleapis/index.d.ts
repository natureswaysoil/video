export const google: {
  auth: {
    OAuth2: new (options?: any) => {
      setCredentials(credentials: any): void
    }
    JWT: new (options: any) => any
  }
  sheets(options: any): any
  youtube(options: any): {
    videos: {
      insert(options: any): Promise<{ data: any }>
    }
  }
}
