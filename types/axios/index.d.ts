interface AxiosResponse<T = any> {
  data: T
  status: number
  statusText: string
  headers?: Record<string, any>
}

interface AxiosInstance {
  get<T = any>(url: string, config?: any): Promise<AxiosResponse<T>>
  post<T = any>(url: string, data?: any, config?: any): Promise<AxiosResponse<T>>
  put<T = any>(url: string, data?: any, config?: any): Promise<AxiosResponse<T>>
  head<T = any>(url: string, config?: any): Promise<AxiosResponse<T>>
  delete?<T = any>(url: string, config?: any): Promise<AxiosResponse<T>>
  request<T = any>(config: { url: string; method?: string; data?: any; headers?: any; responseType?: string; timeout?: number }): Promise<AxiosResponse<T>>
  create(config?: any): AxiosInstance
}

declare const axios: AxiosInstance & {
  create(config?: any): AxiosInstance
}

export type { AxiosInstance, AxiosResponse }
export = axios
export as namespace axios
