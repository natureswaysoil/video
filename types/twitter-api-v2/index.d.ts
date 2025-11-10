export class TwitterApi {
  constructor(auth: any)
  readWrite: TwitterApi
  v1: {
    uploadMedia(data: any, options?: any): Promise<string>
  }
  v2: {
    tweet(body: any): Promise<any>
  }
}
