# TengaPOS Print Agent
#
# Runs a small local HTTP server on this till so the TengaPOS web app (running
# in the browser on this same machine) can print receipts directly to the
# built-in thermal printer, bypassing the OS print dialog entirely.
#
# Why this exists: browsers block raw hardware access for security. WebUSB
# can sometimes reach a printer directly, but on Windows the printer's own
# driver usually claims the USB interface first, which blocks WebUSB from
# ever getting to it. This agent sidesteps that by going through the normal
# Windows print spooler instead of around it — it sends the receipt as a
# "RAW" print job, which the spooler forwards byte-for-byte to the printer
# without trying to render/reformat it, so it works with whatever driver is
# already installed.

param(
  [int]$Port = 38471
)

$AllowedOrigins = @(
  'https://www.tengapos.co.zw',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class TengaRawPrinter
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA
    {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);

    public static bool SendBytesToPrinter(string szPrinterName, byte[] pBytes, out string error)
    {
        IntPtr hPrinter;
        DOCINFOA di = new DOCINFOA();
        int dwWritten;
        bool success = false;
        error = "";
        di.pDocName = "TengaPOS Receipt";
        di.pDataType = "RAW";

        if (!OpenPrinter(szPrinterName, out hPrinter, IntPtr.Zero))
        {
            error = "Could not open printer '" + szPrinterName + "' (Win32 error " + Marshal.GetLastWin32Error() + ")";
            return false;
        }
        try
        {
            if (!StartDocPrinter(hPrinter, 1, di))
            {
                error = "StartDocPrinter failed (Win32 error " + Marshal.GetLastWin32Error() + ")";
                return false;
            }
            try
            {
                if (!StartPagePrinter(hPrinter))
                {
                    error = "StartPagePrinter failed (Win32 error " + Marshal.GetLastWin32Error() + ")";
                    return false;
                }
                success = WritePrinter(hPrinter, pBytes, pBytes.Length, out dwWritten);
                if (!success) error = "WritePrinter failed (Win32 error " + Marshal.GetLastWin32Error() + ")";
                EndPagePrinter(hPrinter);
            }
            finally { EndDocPrinter(hPrinter); }
        }
        finally { ClosePrinter(hPrinter); }
        return success;
    }
}
"@

function Get-DefaultPrinterName {
    (Get-CimInstance -ClassName Win32_Printer -ErrorAction SilentlyContinue | Where-Object { $_.Default -eq $true } | Select-Object -First 1).Name
}

# Sends raw bytes straight to a COM port — used for Bluetooth printers paired
# as a virtual serial port on Windows, and genuine RS-232 serial printers.
# Bypasses the print spooler entirely (there's no "printer object" for a
# bare serial port), unlike the USB/LPT1/network path above.
function Send-BytesToSerialPort($portName, $bytes, [ref]$errorOut) {
    $port = New-Object System.IO.Ports.SerialPort($portName, 9600, [System.IO.Ports.Parity]::None, 8, [System.IO.Ports.StopBits]::One)
    try {
        $port.Open()
        $port.Write($bytes, 0, $bytes.Length)
        return $true
    } catch {
        $errorOut.Value = $_.Exception.Message
        return $false
    } finally {
        if ($port.IsOpen) { $port.Close() }
        $port.Dispose()
    }
}

function Add-CorsHeaders($response, $origin) {
    if ($AllowedOrigins -contains $origin) {
        $response.Headers.Add('Access-Control-Allow-Origin', $origin)
    }
    $response.Headers.Add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    $response.Headers.Add('Access-Control-Allow-Headers', 'Content-Type')
    # Chrome's Private Network Access check — required because the web page
    # is served from a public https origin but this agent lives on the
    # loopback/private network.
    $response.Headers.Add('Access-Control-Allow-Private-Network', 'true')
}

function Write-JsonResponse($response, $obj, [int]$statusCode = 200) {
    $response.StatusCode = $statusCode
    $response.ContentType = 'application/json'
    $json = $obj | ConvertTo-Json -Compress
    $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
    $response.OutputStream.Write($buffer, 0, $buffer.Length)
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Prefixes.Add("http://localhost:$Port/")

try {
    $listener.Start()
} catch {
    Write-Host "Failed to start on port $Port. Run Install-TengaPrintAgent.ps1 as Administrator first (it reserves this port for your account)." -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}

Write-Host "TengaPOS Print Agent running on http://127.0.0.1:$Port" -ForegroundColor Green
Write-Host "Leave this window open (or run it via the installed scheduled task) while using the till."

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response
    $origin = $request.Headers['Origin']
    Add-CorsHeaders $response $origin

    try {
        if ($request.HttpMethod -eq 'OPTIONS') {
            $response.StatusCode = 204
        }
        elseif ($request.HttpMethod -eq 'GET' -and $request.Url.AbsolutePath -eq '/status') {
            $printers = @(Get-CimInstance -ClassName Win32_Printer -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
            $comPorts = @([System.IO.Ports.SerialPort]::GetPortNames())
            Write-JsonResponse $response @{ ok = $true; printers = $printers; defaultPrinter = (Get-DefaultPrinterName); comPorts = $comPorts }
        }
        elseif ($request.HttpMethod -eq 'POST' -and $request.Url.AbsolutePath -eq '/print') {
            $reader = New-Object System.IO.StreamReader($request.InputStream)
            $bodyText = $reader.ReadToEnd()
            $reader.Close()
            $payload = $bodyText | ConvertFrom-Json
            $bytes = [System.Convert]::FromBase64String($payload.data)
            $printError = ''

            if ($payload.comPort) {
                # Bluetooth (paired as a virtual COM port) or genuine RS-232 serial
                $ok = Send-BytesToSerialPort $payload.comPort $bytes ([ref]$printError)
                if ($ok) {
                    Write-JsonResponse $response @{ ok = $true; comPort = $payload.comPort }
                } else {
                    Write-JsonResponse $response @{ ok = $false; error = $printError; comPort = $payload.comPort } 500
                }
            } else {
                $printerName = if ($payload.printerName) { $payload.printerName } else { Get-DefaultPrinterName }
                if (-not $printerName) {
                    Write-JsonResponse $response @{ ok = $false; error = 'No default printer is set on this machine, and none was specified.' } 400
                } else {
                    $ok = [TengaRawPrinter]::SendBytesToPrinter($printerName, $bytes, [ref]$printError)
                    if ($ok) {
                        Write-JsonResponse $response @{ ok = $true; printer = $printerName }
                    } else {
                        Write-JsonResponse $response @{ ok = $false; error = $printError; printer = $printerName } 500
                    }
                }
            }
        }
        else {
            Write-JsonResponse $response @{ ok = $false; error = 'Not found' } 404
        }
    } catch {
        try { Write-JsonResponse $response @{ ok = $false; error = $_.Exception.Message } 500 } catch {}
    } finally {
        $response.OutputStream.Close()
    }
}
