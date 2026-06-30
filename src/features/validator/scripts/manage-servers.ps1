param(
    [Parameter(Mandatory=$true)]
    [string]$Server,
    [Parameter(Mandatory=$true)]
    [string]$Username,
    [Parameter(Mandatory=$true)]
    [string]$Password,
    [Parameter(Mandatory=$true)]
    [string]$Action
)

$ErrorActionPreference = 'SilentlyContinue'

# Helper to output JSON response and exit
function Send-Response($Data) {
    Write-Output ($Data | ConvertTo-Json -Compress)
    exit 0
}

# 1. Action: check (validate credentials & count Office processes)
if ($Action -eq "check") {
    $Path = "\\$Server\IPC$"
    
    # Clean up any previous session to ensure clean validation
    & net.exe use $Path /delete /y 2>$null | Out-Null
    
    # Try mounting the network share to validate credentials
    $Result = & net.exe use $Path $Password /user:$Username 2>&1
    $ExitCode = $LASTEXITCODE
    
    if ($ExitCode -ne 0) {
        # Credentials are invalid or server unreachable
        Send-Response @{
            status = "INVALIDA"
            excelCount = 0
            wordCount = 0
            error = ($Result | Out-String).Trim()
        }
    }
    
    # Credentials are valid. Try querying processes via WMI/CIM first to check start times (ages)
    try {
        $SecPassword = ConvertTo-SecureString $Password -AsPlainText -Force
        $Cred = New-Object System.Management.Automation.PSCredential($Username, $SecPassword)
        
        # Connect using WMI over DCOM protocol (same ports as net use)
        $CimOptions = New-CimSessionOption -Protocol DCOM -ConnectionTimeoutSec 10
        $Session = New-CimSession -ComputerName $Server -Credential $Cred -SessionOption $CimOptions -ErrorAction Stop
        
        $Processes = Get-CimInstance -CimSession $Session -ClassName Win32_Process -Filter "Name = 'excel.exe' or Name = 'winword.exe'" -ErrorAction Stop
        
        $ExcelCount = 0
        $WordCount = 0
        $Now = Get-Date
        
        foreach ($proc in $Processes) {
            $age = $Now - $proc.CreationDate
            # Only count as zombie if it has been running for 5 or more minutes
            if ($age.TotalMinutes -ge 5) {
                if ($proc.Name -like "*excel.exe*") { $ExcelCount++ }
                if ($proc.Name -like "*winword.exe*") { $WordCount++ }
            }
        }
        
        Remove-CimSession $Session -ErrorAction SilentlyContinue
        
        # Disconnect IPC$
        & net.exe use $Path /delete /y 2>$null | Out-Null
        
        Send-Response @{
            status = "VALIDA"
            excelCount = $ExcelCount
            wordCount = $WordCount
        }
    } catch {
        # Fallback to Tasklist if WMI/CIM fails
        $TaskList = & tasklist.exe /S $Server /U $Username /P $Password /FO CSV 2>&1
        $TaskListExitCode = $LASTEXITCODE
        
        $ExcelCount = 0
        $WordCount = 0
        
        if ($TaskListExitCode -eq 0) {
            try {
                $Processes = @($TaskList | ConvertFrom-Csv)
                if ($Processes.Count -gt 0) {
                    $ImageNameProp = ($Processes[0].psobject.properties | Select-Object -First 1 -ExpandProperty Name)
                    foreach ($proc in $Processes) {
                        $name = $proc.$ImageNameProp
                        if ($name -like "*excel.exe*") { $ExcelCount++ }
                        if ($name -like "*winword.exe*") { $WordCount++ }
                    }
                }
            } catch {
                $TaskListString = $TaskList | Out-String
                $ExcelCount = ([regex]::Matches($TaskListString, "(?i)excel\.exe")).Count
                $WordCount = ([regex]::Matches($TaskListString, "(?i)winword\.exe")).Count
            }
        }
        
        # Disconnect IPC$
        & net.exe use $Path /delete /y 2>$null | Out-Null
        
        Send-Response @{
            status = "VALIDA"
            excelCount = $ExcelCount
            wordCount = $WordCount
            warning = "Fallback a Tasklist (WMI no disponible: $_)"
        }
    }
}

# 2. Action: clean (remotely terminate Word/Excel processes older than 5 minutes)
elseif ($Action -eq "clean") {
    try {
        $SecPassword = ConvertTo-SecureString $Password -AsPlainText -Force
        $Cred = New-Object System.Management.Automation.PSCredential($Username, $SecPassword)
        
        $CimOptions = New-CimSessionOption -Protocol DCOM -ConnectionTimeoutSec 10
        $Session = New-CimSession -ComputerName $Server -Credential $Cred -SessionOption $CimOptions -ErrorAction Stop
        
        $Processes = Get-CimInstance -CimSession $Session -ClassName Win32_Process -Filter "Name = 'excel.exe' or Name = 'winword.exe'" -ErrorAction Stop
        $Now = Get-Date
        $KilledPids = @()
        
        foreach ($proc in $Processes) {
            $age = $Now - $proc.CreationDate
            if ($age.TotalMinutes -ge 5) {
                # Terminate only this specific zombie PID
                & taskkill.exe /S $Server /U $Username /P $Password /PID $proc.ProcessId /F 2>&1 | Out-Null
                $KilledPids += $proc.ProcessId
            }
        }
        
        Remove-CimSession $Session -ErrorAction SilentlyContinue
        
        Send-Response @{
            status = "CLEANED"
            success = $true
            details = "PIDs eliminados con éxito (WMI): " + ($KilledPids -join ", ")
        }
    } catch {
        # Fallback: Terminate all Excel and Word processes by name
        $ExcelResult = & taskkill.exe /S $Server /U $Username /P $Password /IM excel.exe /F 2>&1
        $WordResult = & taskkill.exe /S $Server /U $Username /P $Password /IM winword.exe /F 2>&1
        
        Send-Response @{
            status = "CLEANED"
            success = $true
            details = "Fallback taskkill. Excel: $(($ExcelResult | Out-String).Trim()); Word: $(($WordResult | Out-String).Trim())"
        }
    }
}

else {
    Send-Response @{
        status = "ERROR"
        error = "Invalid action: $Action"
    }
}
