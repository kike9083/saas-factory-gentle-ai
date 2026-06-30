import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import path from 'path';

interface ServerTarget {
  ip: string;
  username: string;
}

// Safely execute PowerShell command using native argument passing (prevents shell injection)
function runPowerShellAction(server: string, username: string, password: string, action: 'check' | 'clean'): Promise<any> {
  return new Promise((resolve) => {
    const scriptPath = path.join(process.cwd(), 'src/features/validator/scripts/manage-servers.ps1');
    
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath,
        '-Server', server,
        '-Username', username,
        '-Password', password,
        '-Action', action
      ],
      { timeout: 45000 }, // 45 seconds timeout to allow for network retries
      (error, stdout, stderr) => {
        if (error) {
          resolve({
            ip: server,
            status: 'INVALIDA',
            excelCount: 0,
            wordCount: 0,
            error: (stderr || stdout || error.message || '').trim()
          });
          return;
        }

        try {
          const cleanStdout = stdout.trim();
          // The powershell script output is a single-line JSON string at the end
          const lastLine = cleanStdout.split('\n').pop() || '';
          const parsed = JSON.parse(lastLine);
          resolve({
            ip: server,
            ...parsed
          });
        } catch (e) {
          resolve({
            ip: server,
            status: 'INVALIDA',
            excelCount: 0,
            wordCount: 0,
            error: `Error parsing output: ${stdout}`
          });
        }
      }
    );
  });
}

// Simple and efficient concurrency-limited promise runner
async function limitConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let index = 0;

  const worker = async () => {
    while (index < items.length) {
      const currentIndex = index++;
      const item = items[currentIndex];
      results[currentIndex] = await fn(item);
    }
  };

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { password, action, server, servers } = body;

    if (!password) {
      return NextResponse.json({ error: 'La contraseña es obligatoria.' }, { status: 400 });
    }

    if (action === 'clean') {
      if (!server || !server.ip || !server.username) {
        return NextResponse.json({ error: 'Faltan detalles del servidor para realizar la limpieza.' }, { status: 400 });
      }
      const result = await runPowerShellAction(server.ip, server.username, password, 'clean');
      return NextResponse.json(result);
    }

    if (action === 'check') {
      if (!servers || !Array.isArray(servers) || servers.length === 0) {
        return NextResponse.json({ error: 'Se requiere una lista de servidores para validar.' }, { status: 400 });
      }

      // Check up to 4 servers concurrently to optimize speed without overloading the CPU
      const results = await limitConcurrency(servers as ServerTarget[], 4, (s) =>
        runPowerShellAction(s.ip, s.username, password, 'check')
      );

      return NextResponse.json(results);
    }

    return NextResponse.json({ error: 'Acción no válida.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
