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
  /** Motivo estable para que el front arme su UI (ej. PLAN_FEATURE_UNAVAILABLE). */
  code?: string;
  /** Datos del motivo (capacidad que falta, tope, plan sugerido…). */
  details?: Record<string, unknown>;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
