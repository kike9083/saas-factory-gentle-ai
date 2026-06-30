# Monitoreo y Limpieza DCOM Centralizado

* **Fecha:** 2026-06-11
* **Qué:** Se implementó una aplicación web centralizada en Next.js 16 para monitorear credenciales locales y limpiar remotamente procesos zombies de Office DCOM.
* **Por qué:** Automatizar y centralizar la remediación de errores DCOM en los 12 servidores de la granja cuando están bajo estrés, evitando tener que iniciar sesión manualmente por RDP en cada máquina.
* **Detalles Técnicos:**
  * **Backend (Regla de Antigüedad y Compatibilidad):** 
    * Intenta una conexión WMI/CIM sobre protocolo DCOM (puerto 135) para comprobar la hora de inicio de los procesos. **Solo se listan y matan (por PID específico) procesos que lleven ejecutándose 5 o más minutos**, garantizando que no se interrumpan generaciones activas.
    * Si la consulta WMI está bloqueada por firewall, realiza un fallback automático e independiente de idioma a `tasklist.exe` (extrayendo la primera columna dinámicamente para soportar cabeceras en español e inglés como `"Nombre de imagen"` e `"Image Name"`) y los termina por nombre de proceso (`taskkill.exe /IM`).
  * **Control de Concurrencia:** Pool de promesas asíncronas con límite de 4 ejecuciones concurrentes para optimizar la velocidad sin saturar el servidor central.
  * **UI (Liquid Glass):** Dashboard interactivo en modo oscuro con transparencias esmeriladas, KPI globales de la granja, contador de procesos zombies y botón de limpieza remota individual.
  * **Persistencia:** La lista de IPs y usuarios locales se almacena y administra a nivel cliente con `localStorage`.
