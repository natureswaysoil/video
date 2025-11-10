// Minimal Express definitions so that compilation succeeds without @types/express.

type ExpressRequestHandler = (req: any, res: any, next?: (...args: any[]) => void) => any

declare interface ExpressApplication {
  use: (...handlers: any[]) => ExpressApplication
  get: (path: string, handler: ExpressRequestHandler) => ExpressApplication
  post: (path: string, handler: ExpressRequestHandler) => ExpressApplication
  listen: (port: number | string, callback?: () => void) => any
}

declare function express(): ExpressApplication

declare namespace express {
  export type RequestHandler = ExpressRequestHandler
  export type Application = ExpressApplication
}

export = express
