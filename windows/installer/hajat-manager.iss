; Hajat Manager — installer Windows (Inno Setup 6).
; Dibangun di CI (release-assets.yml): dotnet publish self-contained
; ke ..\src\HajatManager\publish-setup, lalu ISCC.exe script ini.
; Versi disync otomatis via `node scripts/sync-versions.js <ver>`.
#define MyAppName "Hajat Manager"
#define MyAppVersion "1.11.1"
#define MyAppPublisher "Rahmad Widiansyah"
#define MyAppExeName "HajatManager.exe"

[Setup]
AppId={{1a6d6452-7ac5-4b3d-af2b-38e651d86a57}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\Hajat Manager
DefaultGroupName={#MyAppName}
; lowest = tanpa UAC/admin (install ke Local Programs bila bukan admin).
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=..\release
OutputBaseFilename=Hajat-Manager-{#MyAppVersion}-windows-x64-Setup
Compression=lzma2/max
SolidCompression=yes
; Self-contained x64 only — ZIP portable dihapus, Setup mandiri tanpa .NET.
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
WizardStyle=modern
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\{#MyAppExeName}
; Data lokal (%AppData%\HajatManager) TIDAK dihapus saat uninstall.

; Catatan: Indonesian.isl tidak ikut instalasi default Inno Setup 6,
; jadi wizard memakai bahasa Inggris (app tetap Indonesia).
[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Buat ikon Desktop"; Flags: unchecked

[Files]
Source: "..\src\HajatManager\publish-setup\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Jalankan Hajat Manager"; Flags: nowait postinstall skipifsilent
