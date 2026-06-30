import { ServerTarget, ServerValidationResult } from '../types';

export async function checkServers(password: string, servers: ServerTarget[]): Promise<ServerValidationResult[]> {
  const response = await fetch('/api/servers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      password,
      action: 'check',
      servers,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Error del servidor: ${response.status}`);
  }

  return response.json();
}

export async function cleanServer(
  password: string,
  server: ServerTarget
): Promise<{ status: string; success: boolean; details?: string }> {
  const response = await fetch('/api/servers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      password,
      action: 'clean',
      server,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Error del servidor: ${response.status}`);
  }

  return response.json();
}
