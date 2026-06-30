export type ValidationStatus = 'idle' | 'pending' | 'valid' | 'invalid' | 'cleaning' | 'cleaned' | 'failed';

export interface ServerTarget {
  ip: string;
  username: string;
  displayName?: string;
}

export interface ServerValidationResult {
  ip: string;
  status: 'VALIDA' | 'INVALIDA';
  excelCount: number;
  wordCount: number;
  error?: string;
}

export interface ServerState {
  ip: string;
  username: string;
  status: ValidationStatus;
  excelCount: number;
  wordCount: number;
  lastChecked?: string;
  error?: string;
}
