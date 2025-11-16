// Minimal Node.js type declarations

declare namespace NodeJS {
  interface Process {
    env: Record<string, string | undefined>
    uptime(): number
    stdout: { write: (...args: any[]) => void }
    stderr: { write: (...args: any[]) => void }
    cwd(): string
    exit(code?: number): never
    on(event: string, listener: (...args: any[]) => void): this
  }
}

declare var process: NodeJS.Process
declare var global: any

declare class Buffer extends Uint8Array {
  static from(data: ArrayBuffer | ArrayLike<number> | string, encoding?: string): Buffer
  static concat(list: Buffer[], totalLength?: number): Buffer
  static isBuffer(obj: any): obj is Buffer
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
  import { EventEmitter } from 'events'
  
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

  interface Server extends EventEmitter {
    listen(port: number, hostnameOrCallback?: string | (() => void), callback?: () => void): Server
    close(callback?: (err?: any) => void): void
  }

  function createServer(requestListener?: (req: IncomingMessage, res: ServerResponse) => void): Server
  
  export { IncomingMessage, ServerResponse, Server, createServer }
}

declare module 'crypto' {
  export function createHmac(algorithm: string, key: string | Buffer): any
  export function timingSafeEqual(a: Buffer, b: Buffer): boolean
}

declare module 'util' {
  export function promisify<T extends (...args: any[]) => any>(fn: T): (...args: Parameters<T>) => Promise<any>
}

declare module 'fs' {
  export const appendFile: any
  export const readFile: any
  export const mkdir: any
  export function existsSync(path: string): boolean
  export function mkdirSync(path: string, options?: any): void
  export function writeFileSync(path: string, data: string): void
}

declare module 'fs/promises' {
  export function readFile(path: string, encoding?: string): Promise<string>
  export function writeFile(path: string, data: string): Promise<void>
  export function unlink(path: string): Promise<void>
}

declare module 'path' {
  export function dirname(path: string): string
  export function join(...paths: string[]): string
}

declare module 'zod' {
  export const z: any
}

declare module 'node-cache' {
  export default class NodeCache {
    constructor(options?: any)
    get(key: string): any
    set(key: string, value: any, ttl?: number): boolean
    del(key: string): number
    has(key: string): boolean
    flushAll(): void
    getStats(): any
  }
}

declare module 'stream' {
  export class Readable {
    on(event: string, listener: (...args: any[]) => void): this
  }
}
