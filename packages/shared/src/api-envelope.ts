export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiFieldError {
  field: string;
  message: string;
}

export interface ApiFailure {
  success: false;
  message: string;
  errors?: ApiFieldError[];
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
