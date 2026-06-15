# Guía de Configuración del Entorno (Multi-Máquina)

Esta guía detalla los pasos necesarios para clonar e instalar **SaaS Factory V4 + Gentle-AI** en una computadora nueva o secundaria, garantizando que todo el ecosistema (agentes de IA, base de datos de memoria persistente engram y auditoría gga) quede listo para trabajar de inmediato.

> [!IMPORTANT]
> Realizá esta configuración utilizando **PowerShell** en Windows para asegurar la correcta registración de las variables de entorno (`PATH`) y la carga del perfil.

---

## Pasos para Configurar una Nueva Computadora

### 1. Instalar la versión más reciente de Gentle-AI
Ejecutá el script de instalación oficial de Gentle-AI para Windows. Este descargará la última versión estable (que ya incluye soporte para el comando `doctor` y correcciones del instalador):

```powershell
irm https://raw.githubusercontent.com/Gentleman-Programming/gentle-ai/main/scripts/install.ps1 | iex
```

### 2. Instalar los componentes globales (Engram y GGA)
Utilizá el CLI de Gentle-AI recién instalado para descargar y configurar la base de datos de memoria persistente (**Engram**) y el sistema de auditoría git (**Gentleman Guardian Angel**):

```powershell
gentle-ai install --component engram --component gga
```

### 3. Clonar la plantilla de SaaS Factory
Cloná tu repositorio de plantilla en el directorio que prefieras de tu disco (por ejemplo, en `C:\Proyectos` o tu carpeta habitual de desarrollo):

```powershell
git clone https://github.com/kike9083/saas-factory-gentle-ai.git C:\Proyectos\saas-factory-gentle-ai
```

### 4. Configurar el alias rápido en PowerShell
Para poder inicializar la fábrica desde cualquier carpeta vacía, abrí tu perfil de PowerShell (`$PROFILE`) y agregá la función rápida apuntando a la ruta donde clonaste la plantilla en el paso 3:

```powershell
function saas-factory-gentle { node 'C:\Proyectos\saas-factory-gentle-ai\bin\install.js' }
```
*Recordá reiniciar la consola o recargar el perfil ejecutando `. $PROFILE` para activar el comando.*

---

## Flujo de Trabajo en Proyectos Nuevos y Existentes

Una vez que el sistema global esté configurado, debés inicializar las herramientas específicas en cada proyecto donde vayas a trabajar.

### 5. Configurar el Guardián de Git (GGA) en tu repositorio
En la carpeta raíz de tu proyecto, ejecutá estos dos comandos para activar las auditorías antes de cada commit:

```powershell
# 1. Genera la configuración de auditoría y el archivo de reglas de código (AGENTS.md)
gga init

# 2. Instala el hook git pre-commit en tu repositorio local
gga install
```
*A partir de ahora, cada commit será auditado automáticamente para evitar fugas de secrets o código defectuoso.*

### 6. Inicializar el contexto del Agente (/sdd-init)
Cuando abras tu agente de IA (como Claude Code, Gemini o el orquestador de OpenCode) en tu proyecto, el agente debe cargar las directrices de desarrollo.

* **Ejecución manual:** Podés correr el comando directo en el chat del agente:
  ```text
  /sdd-init
  ```
* **Ejecución automática:** Si te olvidás, el orquestador de Gentle-AI tiene un guardián de contexto (*Init Guard*) en sus reglas del sistema que detectará que falta la inicialización y correrá `/sdd-init` de forma automática la primera vez que le pidas hacer algo.

### 7. Sincronizar la memoria de tus proyectos (Engram)
* **Si usás el modo basado en archivos (default):** El historial de decisiones, bugs y contexto del proyecto se guardan dentro de la propia carpeta del repositorio (en `.claude/memory` u `.atl/`). Al clonar el proyecto en tu otra máquina, el agente leerá el historial de forma nativa.
* **Si usás base de datos remota:** Sincronizá la memoria de la base de datos de Engram corriendo:
  ```powershell
  engram sync --cloud
  ```

---

## Diagnóstico de Salud del Sistema
Una vez completado el flujo, podés verificar que todas las piezas estén en su lugar ejecutando:

```powershell
gentle-ai doctor
```

> [!NOTE]
> Si el diagnóstico indica que algún binario (`engram` o `gga`) no se encuentra en el `PATH`, simplemente reiniciá la terminal o el editor de código (IDE) para que Windows impacte las variables de entorno en los procesos nuevos.
