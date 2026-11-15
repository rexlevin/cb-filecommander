param(
    [Parameter(Mandatory = $true)][string]$Lnk,
    [Parameter(Mandatory = $true)][string]$Aumid,
    [string]$AppsDir = '',
    [string]$Target = '',
    [string]$Arguments = '',
    [string]$WorkingDirectory = '',
    [string]$Icon = '',
    [string]$AllowCreate = '0'
)

# 为开始菜单快捷方式写入 System.AppUserModel.ID。
# 必须与进程 AppUserModelID 一致，Windows 才能把“固定到任务栏”关联到该快捷方式，
# 否则系统会退化成创建一个指向 electron.exe（无参数）的快捷方式。
$ErrorActionPreference = 'Stop'
$result = [ordered]@{ ok = $false; action = 'error'; aumid = '' }
$script:verifiedAumid = ''

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class CanboxShortcutProperty
{
    [StructLayout(LayoutKind.Sequential)]
    public struct PROPERTYKEY { public Guid fmtid; public uint pid; }

    [StructLayout(LayoutKind.Explicit)]
    public struct PROPVARIANT
    {
        [FieldOffset(0)] public ushort vt;
        [FieldOffset(8)] public IntPtr pointerValue;
    }

    [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
    public interface IPropertyStore
    {
        uint GetCount();
        void GetAt(uint iProp, out PROPERTYKEY pkey);
        void GetValue(ref PROPERTYKEY key, out PROPVARIANT pv);
        void SetValue(ref PROPERTYKEY key, ref PROPVARIANT pv);
        void Commit();
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    static extern int SHGetPropertyStoreFromParsingName(
        [MarshalAs(UnmanagedType.LPWStr)] string pszPath,
        IntPtr pbc,
        uint flags,
        ref Guid riid,
        [MarshalAs(UnmanagedType.Interface)] out IPropertyStore ppv);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool MoveFileEx(string lpExistingFileName, string lpNewFileName, uint dwFlags);

    // MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH
    public static bool ReplaceFile(string source, string destination)
    {
        return MoveFileEx(source, destination, 0x1 | 0x8);
    }

    public static bool SetAppUserModelId(string lnkPath, string aumid)
    {
        Guid iid = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
        IPropertyStore store;
        int hr = SHGetPropertyStoreFromParsingName(lnkPath, IntPtr.Zero, 2, ref iid, out store);
        if (hr != 0 || store == null) return false;

        PROPERTYKEY key = new PROPERTYKEY();
        key.fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
        key.pid = 5;

        PROPVARIANT pv = new PROPVARIANT();
        pv.vt = 31; // VT_LPWSTR
        pv.pointerValue = Marshal.StringToCoTaskMemUni(aumid);
        try
        {
            store.SetValue(ref key, ref pv);
            store.Commit();
        }
        finally
        {
            Marshal.FreeCoTaskMem(pv.pointerValue);
            Marshal.ReleaseComObject(store);
        }
        return true;
    }
}
'@

function Get-ShortcutAumid([string]$Path) {
    $shell = $null
    $folder = $null
    $item = $null
    try {
        $shell = New-Object -ComObject Shell.Application
        $folder = $shell.Namespace((Split-Path -Path $Path -Parent))
        if (-not $folder) { return '' }
        $item = $folder.ParseName((Split-Path -Path $Path -Leaf))
        if (-not $item) { return '' }
        return [string]$item.ExtendedProperty('System.AppUserModel.ID')
    } catch {
        return ''
    } finally {
        # 及时释放 Shell COM 对象，否则它会在本进程中保持 .lnk 句柄，导致后续替换失败
        if ($item) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($item) }
        if ($folder) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($folder) }
        if ($shell) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($shell) }
        [GC]::Collect()
    }
}

function Read-Shortcut([string]$Path) {
    $ws = New-Object -ComObject WScript.Shell
    $link = $ws.CreateShortcut($Path)
    $info = [pscustomobject]@{
        target           = [string]$link.TargetPath
        arguments        = [string]$link.Arguments
        workingDirectory = [string]$link.WorkingDirectory
        icon             = [string]$link.IconLocation
    }
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($link)
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($ws)
    $info | Add-Member -NotePropertyName aumid -NotePropertyValue (Get-ShortcutAumid $Path)
    return $info
}

# 先在临时文件上生成，再用 Move-Item 覆盖。
# 开始菜单中已存在的 .lnk 常被 Shell 占用，直接 Save() 会报“Unable to save shortcut”。
function Write-Shortcut {
    param($TargetPath, $StartArgs, $WorkDir, $IconLocation)
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('canbox-shortcut-' + [Guid]::NewGuid().ToString('N') + '.lnk')
    $ws = New-Object -ComObject WScript.Shell
    $link = $ws.CreateShortcut($tmp)
    $link.TargetPath = $TargetPath
    if ($StartArgs) { $link.Arguments = $StartArgs }
    if ($WorkDir) { $link.WorkingDirectory = $WorkDir }
    if ($IconLocation) { $link.IconLocation = $IconLocation }
    $link.Save()

    # 必须先释放 WScript.Shell 对象再写属性，否则它仍持有 .lnk 句柄，
    # 属性写入会偶发失败、生成一个没有 AppUserModelID 的快捷方式（固定到任务栏再次失效）
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($link)
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($ws)
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()

    $hasAumid = $false
    for ($i = 0; $i -lt 3 -and -not $hasAumid; $i++) {
        [void][CanboxShortcutProperty]::SetAppUserModelId($tmp, $Aumid)
        $hasAumid = ((Get-ShortcutAumid $tmp) -eq $Aumid)
        if (-not $hasAumid) { Start-Sleep -Milliseconds 120 }
    }

    if (-not $hasAumid -and (Test-Path -LiteralPath $Lnk)) {
        # 宁可不更新，也不要用缺少 AUMID 的快捷方式覆盖已有正确快捷方式
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
        throw "无法写入 AppUserModelID: $Aumid"
    }
    $script:verifiedAumid = if ($hasAumid) { $Aumid } else { '' }

    $dir = Split-Path -Path $Lnk -Parent
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

    # 原子替换（MOVEFILE_REPLACE_EXISTING），避免 Shell 占用导致的 Save/Move 失败；
    # Explorer 偶尔短暂占用目标文件，失败时重试几次
    $replaced = $false
    for ($i = 0; $i -lt 5 -and -not $replaced; $i++) {
        $replaced = [CanboxShortcutProperty]::ReplaceFile($tmp, $Lnk)
        if (-not $replaced) { Start-Sleep -Milliseconds 150 }
    }
    if (-not $replaced) {
        if (Test-Path -LiteralPath $Lnk) { Remove-Item -LiteralPath $Lnk -Force }
        Move-Item -LiteralPath $tmp -Destination $Lnk -Force
    }
}

try {
    $exists = Test-Path -LiteralPath $Lnk

    if (-not $exists) {
        if ($AllowCreate -eq '1' -and $Target) {
            Write-Shortcut -TargetPath $Target -StartArgs $Arguments -WorkDir $WorkingDirectory -IconLocation ($(if ($Icon) { "$Icon,0" } else { '' }))
            $result.action = 'created'
        } else {
            $result.action = 'missing'
        }
    } else {
        $existing = Read-Shortcut $Lnk

        if ($existing.aumid -eq $Aumid) {
            if ($AllowCreate -eq '1' -and $Target) {
                Write-Shortcut -TargetPath $Target -StartArgs $Arguments -WorkDir $WorkingDirectory -IconLocation ($(if ($Icon) { "$Icon,0" } else { $existing.icon }))
                $result.action = 'refreshed'
            } else {
                $result.action = 'unchanged'
            }
        } elseif ($existing.target -match 'canbox\.exe$' -and $existing.arguments -match '(?:^|\s)app\s+(\S+)') {
            # manager 生成的快捷方式：只有目标 APP 确实已安装时才保留其启动方式，仅补 AUMID
            $installedId = $Matches[1]
            $installed = $false
            if ($AppsDir) { $installed = Test-Path -LiteralPath (Join-Path $AppsDir $installedId) }

            if ($installed) {
                Write-Shortcut -TargetPath $existing.target -StartArgs $existing.arguments -WorkDir $existing.workingDirectory -IconLocation $existing.icon
                $result.action = 'aumid-added'
            } elseif ($AllowCreate -eq '1' -and $Target) {
                Write-Shortcut -TargetPath $Target -StartArgs $Arguments -WorkDir $WorkingDirectory -IconLocation ($(if ($Icon) { "$Icon,0" } else { '' }))
                $result.action = 'replaced'
            } else {
                $result.action = 'skipped'
            }
        } elseif ($AllowCreate -eq '1' -and $Target) {
            Write-Shortcut -TargetPath $Target -StartArgs $Arguments -WorkDir $WorkingDirectory -IconLocation ($(if ($Icon) { "$Icon,0" } else { '' }))
            $result.action = 'replaced'
        } else {
            Write-Shortcut -TargetPath $existing.target -StartArgs $existing.arguments -WorkDir $existing.workingDirectory -IconLocation $existing.icon
            $result.action = 'aumid-added'
        }
    }

    # 优先使用写入时校验过的值：Shell 属性读取在刚替换文件后可能命中旧缓存
    $result.aumid = if ($script:verifiedAumid) { $script:verifiedAumid } else { Get-ShortcutAumid $Lnk }
    $result.ok = $true
} catch {
    $result.error = $_.Exception.Message
}

$result | ConvertTo-Json -Compress

