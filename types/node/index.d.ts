// Minimal Node.js type declarations to satisfy the compiler when @types/node is unavailable.

declare namespace NodeJS {
  interface Process {
    env: Record<string, string | undefined>
    uptime(): number
    stdout: { write: (...args: any[]) => void }
    stderr: { write: (...args: any[]) => void }
    cwd(): string
    exit(code?: number): never
  }
}

declare var process: NodeJS.Process

declare class Buffer extends Uint8Array {
  static from(data: ArrayBuffer | ArrayLike<number> | string, encoding?: string): Buffer
  static concat(list: Buffer[], totalLength?: number): Buffer
  toString(encoding?: string): string
}

declare var require: {
  (id: string): any
  main?: { filename?: string }
}

declare var module: {
  exports: any
  parent?: any
}

declare module 'http' {
  namespace http {
    interface IncomingMessage extends AsyncIterable<Uint8Array> {
      url?: string | null
      method?: string | null
      headers: Record<string, string | string[] | undefined>
    }

    interface ServerResponse {
      statusCode: number
      headersSent?: boolean
      setHeader(name: string, value: string): void
      end(data?: any): void
      json?: (data: any) => void
    }

    interface Server {
      listen(port: number, hostnameOrCallback?: string | (() => void), callback?: () => void): Server
      close(callback?: (err?: any) => void): void
    }

    type RequestListener = (req: IncomingMessage, res: ServerResponse) => void

    function createServer(listener?: RequestListener): Server
  }

  type IncomingMessage = http.IncomingMessage
  type ServerResponse = http.ServerResponse
  type Server = http.Server
  type RequestListener = http.RequestListener

  function createServer(listener?: RequestListener): Server

  export { IncomingMessage, ServerResponse, Server, RequestListener, createServer }
  export = http
}

declare module 'stream' {
  class Readable {
    [Symbol.asyncIterator](): AsyncIterableIterator<any>
    pipe<T>(destination: T, options?: { end?: boolean }): T
  }
  export { Readable }
}

declare module 'fs' {
  export const promises: any
  export function existsSync(path: string): boolean
  export function mkdirSync(path: string, options?: any): void
  export function writeFileSync(path: string, data: any, options?: any): void
}

declare module 'path' {
  export function join(...segments: any[]): string
  export function resolve(...segments: any[]): string
}
