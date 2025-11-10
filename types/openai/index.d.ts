export default class OpenAI {
  constructor(config?: any)
  chat: {
    completions: {
      create(params: any): Promise<{ choices: Array<{ message?: { content?: string } }> }>
    }
  }
  responses?: {
    create(params: any): Promise<any>
  }
}
