"use client";

import React, { useState, useEffect } from 'react';
import { ServerTarget, ServerState, ValidationStatus } from '../types';
import { checkServers, cleanServer } from '../services/validator-service';

// Default list of 12 servers from the user's PowerShell script
const DEFAULT_SERVERS: ServerTarget[] = [
  { ip: "10.149.106.2", username: ".\\Administrator" },
  { ip: "10.149.106.3", username: ".\\Administrator" },
  { ip: "10.149.106.4", username: ".\\Administrator" },
  { ip: "10.149.106.5", username: ".\\Administrator" },
  { ip: "10.149.106.6", username: ".\\Administrator" },
  { ip: "10.149.106.7", username: ".\\Administrador" }, // Spanish OS
  { ip: "10.149.106.8", username: ".\\Administrator" },
  { ip: "10.149.106.9", username: ".\\Administrador" }, // Spanish OS
  { ip: "10.149.106.22", username: ".\\Administrator" },
  { ip: "10.149.106.29", username: ".\\Administrator" },
  { ip: "10.149.204.105", username: ".\\Administrator" },
  { ip: "10.149.104.9", username: ".\\Administrador" }  // Spanish OS
];

export default function ValidatorDashboard() {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [servers, setServers] = useState<ServerState[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  
  // Settings Panel State
  const [showSettings, setShowSettings] = useState(false);
  const [newIp, setNewIp] = useState('');
  const [newUsername, setNewUsername] = useState('.\\Administrator');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Load servers from localStorage or default list on mount
  useEffect(() => {
    const saved = localStorage.getItem('dcom_servers');
    if (saved) {
      try {
        const parsed: ServerTarget[] = JSON.parse(saved);
        setServers(parsed.map(s => ({
          ...s,
          status: 'idle',
          excelCount: 0,
          wordCount: 0
        })));
        return;
      } catch (e) {
        console.error('Failed to parse saved servers, reverting to defaults');
      }
    }
    
    // Set defaults
    setServers(DEFAULT_SERVERS.map(s => ({
      ...s,
      status: 'idle',
      excelCount: 0,
      wordCount: 0
    })));
  }, []);

  // Save servers to localStorage
  const saveServersList = (list: ServerTarget[]) => {
    localStorage.setItem('dcom_servers', JSON.stringify(list));
    setServers(list.map(s => {
      const existing = servers.find(ex => ex.ip === s.ip);
      return {
        ...s,
        status: existing?.status || 'idle',
        excelCount: existing?.excelCount || 0,
        wordCount: existing?.wordCount || 0,
        lastChecked: existing?.lastChecked,
        error: existing?.error
      };
    }));
  };

  // Run Check validation for all servers in parallel
  const handleCheckAll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setGlobalError('Por favor ingresá la contraseña máster.');
      return;
    }
    
    setGlobalError(null);
    setIsChecking(true);
    
    // Mark all servers as pending
    setServers(prev => prev.map(s => ({ ...s, status: 'pending', error: undefined })));

    try {
      // Prepare targets for API
      const targets: ServerTarget[] = servers.map(s => ({ ip: s.ip, username: s.username }));
      
      const results = await checkServers(password, targets);
      
      // Map results back to state
      setServers(prev => prev.map(s => {
        const res = results.find(r => r.ip === s.ip);
        if (res) {
          return {
            ...s,
            status: res.status === 'VALIDA' ? 'valid' : 'invalid',
            excelCount: res.excelCount,
            wordCount: res.wordCount,
            error: res.error,
            lastChecked: new Date().toLocaleTimeString()
          };
        }
        return { ...s, status: 'failed', error: 'No se obtuvo respuesta del backend.' };
      }));
    } catch (err: any) {
      setGlobalError(err.message || 'Ocurrió un error al procesar las validaciones.');
      setServers(prev => prev.map(s => s.status === 'pending' ? { ...s, status: 'failed', error: 'Fallo de API.' } : s));
    } finally {
      setIsChecking(false);
    }
  };

  // Run Clean remote processes for one specific server
  const handleCleanServer = async (server: ServerState) => {
    if (!password) {
      setGlobalError('Por favor ingresá la contraseña máster primero.');
      return;
    }

    // Set status to cleaning
    setServers(prev => prev.map(s => s.ip === server.ip ? { ...s, status: 'cleaning', error: undefined } : s));

    try {
      const target: ServerTarget = { ip: server.ip, username: server.username };
      const res = await cleanServer(password, target);

      if (res.success) {
        setServers(prev => prev.map(s => s.ip === server.ip ? {
          ...s,
          status: 'cleaned',
          excelCount: 0,
          wordCount: 0,
          lastChecked: new Date().toLocaleTimeString()
        } : s));
      } else {
        setServers(prev => prev.map(s => s.ip === server.ip ? {
          ...s,
          status: 'failed',
          error: res.details || 'Fallo de limpieza'
        } : s));
      }
    } catch (err: any) {
      setServers(prev => prev.map(s => s.ip === server.ip ? {
        ...s,
        status: 'failed',
        error: err.message || 'Error de red en limpieza.'
      } : s));
    }
  };

  // Manage Servers (Settings Panel Actions)
  const addServer = () => {
    if (!newIp) return;
    
    // Check if IP already exists
    if (servers.some(s => s.ip === newIp)) {
      alert('Esta IP ya está agregada en el panel.');
      return;
    }

    const newList = [...servers.map(s => ({ ip: s.ip, username: s.username })), { ip: newIp, username: newUsername }];
    saveServersList(newList);
    
    setNewIp('');
    setNewUsername('.\\Administrator');
  };

  const deleteServer = (ipToDelete: string) => {
    if (confirm(`¿Estás seguro de remover el servidor ${ipToDelete}?`)) {
      const newList = servers
        .filter(s => s.ip !== ipToDelete)
        .map(s => ({ ip: s.ip, username: s.username }));
      saveServersList(newList);
    }
  };

  // Computed metrics
  const totalServers = servers.length;
  const validServers = servers.filter(s => s.status === 'valid' || s.status === 'cleaned').length;
  const invalidServers = servers.filter(s => s.status === 'invalid' || s.status === 'failed').length;
  const zombieProcesses = servers.reduce((acc, s) => acc + s.excelCount + s.wordCount, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-white relative overflow-hidden font-sans pb-16">
      {/* Liquid Glass Background Elements */}
      <div className="absolute inset-0 bg-slate-950 [background-image:radial-gradient(at_40%_20%,rgba(120,119,198,0.2)_0px,transparent_50%),radial-gradient(at_80%_0%,rgba(244,63,94,0.15)_0px,transparent_50%),radial-gradient(at_0%_50%,rgba(59,130,246,0.15)_0px,transparent_50%),radial-gradient(at_80%_50%,rgba(168,85,247,0.15)_0px,transparent_50%)] z-0"></div>
      
      {/* Decorative animated blobs */}
      <div className="absolute top-20 left-10 w-96 h-96 bg-purple-500 rounded-full blur-[160px] opacity-20 animate-pulse pointer-events-none"></div>
      <div className="absolute bottom-20 right-10 w-[500px] h-[500px] bg-blue-500 rounded-full blur-[180px] opacity-10 pointer-events-none"></div>

      {/* Main Content Layout */}
      <div className="max-w-7xl mx-auto px-6 relative z-10 pt-10">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between border-b border-white/10 pb-8 mb-8 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-cyan-400 shadow-lg shadow-cyan-400/50 animate-ping"></span>
              <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                DCOM & Credential Manager
              </h1>
            </div>
            <p className="text-slate-400 mt-2 text-sm md:text-base">
              Monitoreo centralizado y reciclado remoto de procesos Office DCOM
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all duration-300 flex items-center gap-2 hover:scale-105"
            >
              <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {showSettings ? 'Ver Dashboard' : 'Administrar IPs'}
            </button>
          </div>
        </header>

        {/* Global Error Banner */}
        {globalError && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 mb-8 text-rose-300 backdrop-blur-lg flex items-center gap-3 animate-shake">
            <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-sm font-medium">{globalError}</span>
          </div>
        )}

        {/* Dynamic Panel: Settings (IP Manager) vs main Dashboard */}
        {showSettings ? (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl transition-all duration-300">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span>Administrar Lista de Servidores</span>
              <span className="text-xs font-normal bg-white/10 text-slate-300 px-2.5 py-0.5 rounded-full">
                Guardado en Navegador
              </span>
            </h2>
            <p className="text-slate-400 mb-6 text-sm">
              Estos servidores se guardan localmente en la caché de tu navegador. Podés configurar el usuario específico (Español o Inglés) para que coincida con la localización del SO de cada servidor.
            </p>

            {/* Form to add a server */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white/5 border border-white/5 rounded-2xl p-6 mb-8">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-300">Dirección IP o Hostname</label>
                <input
                  type="text"
                  value={newIp}
                  onChange={(e) => setNewIp(e.target.value)}
                  placeholder="ej. 10.149.106.7"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-white/30 transition-all text-sm"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-300">Usuario Administrador (Local)</label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="ej. .\Administrador"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-white/30 transition-all text-sm"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={addServer}
                  className="w-full bg-white text-black font-semibold hover:bg-slate-200 transition-all rounded-xl py-2.5 text-sm flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Agregar Servidor
                </button>
              </div>
            </div>

            {/* List of configured servers */}
            <div className="border border-white/10 rounded-2xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10 text-xs font-bold uppercase tracking-wider text-slate-400">
                    <th className="px-6 py-4">IP / Host</th>
                    <th className="px-6 py-4">Usuario</th>
                    <th className="px-6 py-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {servers.map((s, index) => (
                    <tr key={s.ip} className="hover:bg-white/5 transition-all">
                      <td className="px-6 py-4 font-mono text-sm">{s.ip}</td>
                      <td className="px-6 py-4 font-mono text-sm text-slate-300">{s.username}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => deleteServer(s.ip)}
                          className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 p-2 rounded-lg transition-all"
                          title="Eliminar"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {servers.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-slate-500 text-sm">
                        No hay servidores configurados. Re-inicializá o agregá uno arriba.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  if (confirm('¿Quieres restablecer la lista de servidores a la predeterminada de 12 IPs?')) {
                    saveServersList(DEFAULT_SERVERS);
                  }
                }}
                className="px-4 py-2 border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 rounded-xl text-sm transition-all"
              >
                Restablecer Valores Predeterminados
              </button>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="px-6 py-2 bg-white text-black font-semibold hover:bg-slate-200 rounded-xl text-sm transition-all"
              >
                Volver al Monitoreo
              </button>
            </div>
          </div>
        ) : (
          /* Main Dashboard */
          <>
            {/* Master Credentials Form (Liquid Glass Top Banner) */}
            <form onSubmit={handleCheckAll} className="relative bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border border-white/20 rounded-3xl p-6 shadow-2xl overflow-hidden mb-8">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent"></div>
              
              <div className="flex flex-col lg:flex-row items-center justify-between gap-6 relative z-10">
                <div className="flex items-center gap-4 w-full lg:w-auto">
                  <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shadow-lg">
                    <svg className="w-6 h-6 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-white">Contraseña de Validación</h3>
                    <p className="text-xs text-slate-400">Introduce la contraseña del administrador local para la red</p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch gap-3 w-full lg:w-1/2">
                  <div className="relative flex-1">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Ingrese la contraseña"
                      disabled={isChecking}
                      className="w-full bg-black/35 hover:bg-black/50 focus:bg-black/50 border border-white/10 focus:border-white/30 rounded-2xl px-5 py-3.5 pr-12 outline-none text-white text-sm transition-all tracking-wide"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                    >
                      {showPassword ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <button
                    type="submit"
                    disabled={isChecking || !password}
                    className={`px-8 py-3.5 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 border border-white/20 select-none shadow-xl ${
                      isChecking || !password
                        ? 'bg-white/10 text-slate-500 cursor-not-allowed border-transparent'
                        : 'bg-white text-black hover:bg-slate-200 hover:scale-102 hover:shadow-white/5 active:scale-98'
                    }`}
                  >
                    {isChecking ? (
                      <>
                        <span className="w-4 h-4 rounded-full border-2 border-slate-600 border-t-transparent animate-spin"></span>
                        Validando...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89H18" />
                        </svg>
                        Escanear Granja
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>

            {/* KPI Cards Section */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {/* Card 1: Total */}
              <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-lg relative overflow-hidden">
                <span className="text-slate-400 text-xs font-bold uppercase tracking-wider block">Servidores</span>
                <span className="text-3xl font-extrabold text-white mt-1 block">{totalServers}</span>
                <div className="absolute right-4 bottom-4 text-white/5 font-bold text-6xl select-none">IP</div>
              </div>

              {/* Card 2: Valid */}
              <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-lg relative overflow-hidden">
                <span className="text-slate-400 text-xs font-bold uppercase tracking-wider block">Credenciales Válidas</span>
                <span className="text-3xl font-extrabold text-emerald-400 mt-1 block">{validServers}</span>
                <div className="absolute right-4 bottom-4 text-emerald-500/5 font-bold text-6xl select-none">OK</div>
              </div>

              {/* Card 3: Invalid */}
              <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-lg relative overflow-hidden">
                <span className="text-slate-400 text-xs font-bold uppercase tracking-wider block">Fallidos / Inválidos</span>
                <span className="text-3xl font-extrabold text-rose-500 mt-1 block">{invalidServers}</span>
                <div className="absolute right-4 bottom-4 text-rose-500/5 font-bold text-6xl select-none">ERR</div>
              </div>

              {/* Card 4: Zombie processes */}
              <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-lg relative overflow-hidden">
                <span className="text-slate-400 text-xs font-bold uppercase tracking-wider block">Procesos Office colgados</span>
                <span className="text-3xl font-extrabold text-amber-500 mt-1 block">{zombieProcesses}</span>
                <div className="absolute right-4 bottom-4 text-amber-500/5 font-bold text-6xl select-none">EXE</div>
              </div>
            </div>

            {/* Grid of Servers */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {servers.map((server) => {
                const hasZombies = server.excelCount > 0 || server.wordCount > 0;
                
                // Determine layout backgrounds and colors based on status
                let statusColor = 'text-slate-400';
                let statusBg = 'bg-slate-500/10 border-slate-500/20';
                let statusText = 'No verificado';
                
                if (server.status === 'pending') {
                  statusColor = 'text-cyan-400';
                  statusBg = 'bg-cyan-500/10 border-cyan-500/30 shadow-lg shadow-cyan-500/5';
                  statusText = 'Validando...';
                } else if (server.status === 'valid') {
                  statusColor = 'text-emerald-400';
                  statusBg = 'bg-emerald-500/10 border-emerald-500/30';
                  statusText = 'VÁLIDA';
                } else if (server.status === 'invalid') {
                  statusColor = 'text-rose-500';
                  statusBg = 'bg-rose-500/10 border-rose-500/30 shadow-lg shadow-rose-500/5 animate-pulse';
                  statusText = 'INVÁLIDA';
                } else if (server.status === 'cleaning') {
                  statusColor = 'text-amber-400';
                  statusBg = 'bg-amber-500/10 border-amber-500/30 animate-pulse';
                  statusText = 'Limpiando...';
                } else if (server.status === 'cleaned') {
                  statusColor = 'text-teal-400';
                  statusBg = 'bg-teal-500/15 border-teal-500/40';
                  statusText = 'VÁLIDA (Limpio)';
                } else if (server.status === 'failed') {
                  statusColor = 'text-rose-400';
                  statusBg = 'bg-rose-950/20 border-rose-900/30';
                  statusText = 'ERROR RED';
                }

                return (
                  <div
                    key={server.ip}
                    className={`relative backdrop-blur-xl border rounded-2xl p-6 shadow-xl transition-all duration-300 hover:scale-102 flex flex-col justify-between overflow-hidden ${
                      hasZombies 
                        ? 'bg-amber-950/15 border-amber-500/30 shadow-amber-500/5' 
                        : 'bg-slate-900/40 border-white/10'
                    }`}
                  >
                    {/* Background glow if processes active */}
                    {hasZombies && (
                      <div className="absolute -top-12 -right-12 w-24 h-24 bg-amber-500 rounded-full blur-2xl opacity-20 pointer-events-none"></div>
                    )}

                    {/* Server Info */}
                    <div>
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h4 className="text-xl font-bold tracking-tight font-mono text-white">
                            {server.ip}
                          </h4>
                          <span className="text-xs text-slate-400 font-mono mt-0.5 block">
                            User: {server.username}
                          </span>
                        </div>
                        
                        {/* Status Badge */}
                        <div className={`border px-3 py-1 rounded-full text-xs font-bold ${statusColor} ${statusBg} flex items-center gap-1.5`}>
                          {server.status === 'pending' || server.status === 'cleaning' ? (
                            <span className="w-1.5 h-1.5 rounded-full bg-current animate-ping"></span>
                          ) : server.status === 'valid' || server.status === 'cleaned' ? (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                          ) : (
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                          )}
                          {statusText}
                        </div>
                      </div>

                      {/* Process counts & details */}
                      <div className="bg-black/35 rounded-xl p-4 border border-white/5 mb-6 text-sm flex flex-col gap-3 font-mono">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 text-xs">excel.exe zombies:</span>
                          <span className={`font-bold ${server.excelCount > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                            {server.excelCount}
                          </span>
                        </div>
                        <div className="flex justify-between items-center border-t border-white/5 pt-2">
                          <span className="text-slate-400 text-xs">winword.exe zombies:</span>
                          <span className={`font-bold ${server.wordCount > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                            {server.wordCount}
                          </span>
                        </div>
                        {server.lastChecked && (
                          <div className="text-[10px] text-slate-500 text-right mt-1 font-mono">
                            Chequeado: {server.lastChecked}
                          </div>
                        )}
                      </div>

                      {/* Specific error detail if invalid */}
                      {server.error && (
                        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 mb-6 text-xs text-rose-300 max-h-24 overflow-y-auto font-mono scrollbar-thin">
                          <strong>Detalle:</strong> {server.error}
                        </div>
                      )}
                    </div>

                    {/* Action button */}
                    <div className="mt-auto">
                      {server.status === 'valid' || server.status === 'cleaned' || hasZombies ? (
                        <button
                          type="button"
                          onClick={() => handleCleanServer(server)}
                          disabled={server.status === 'cleaning'}
                          className={`w-full py-2.5 rounded-xl font-bold text-sm transition-all duration-300 flex items-center justify-center gap-2 border ${
                            hasZombies
                              ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 border-amber-500/40 text-amber-300 shadow-md shadow-amber-500/10'
                              : 'bg-white/5 hover:bg-white/10 border-white/10 text-white'
                          }`}
                        >
                          {server.status === 'cleaning' ? (
                            <>
                              <span className="w-4 h-4 rounded-full border-2 border-amber-300 border-t-transparent animate-spin"></span>
                              Limpiando...
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              Matar Zombies
                            </>
                          )}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="w-full py-2.5 bg-white/5 border border-white/5 text-slate-500 rounded-xl text-sm font-semibold cursor-not-allowed text-center"
                        >
                          Limpieza no disponible
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Empty grid message */}
            {servers.length === 0 && (
              <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-12 text-center text-slate-400">
                No hay servidores configurados. Hacé click en "Administrar IPs" arriba para configurar tu granja.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
