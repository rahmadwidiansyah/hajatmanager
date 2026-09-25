; Hajat Manager (Flutter) — installer Windows (Inno Setup 6).
; Dibangun di CI (release-assets.yml): flutter build windows ke
; ..\..\mobile\build\windows\x64\runner\Release, lalu ISCC.exe script ini.
; Berdampingan dengan varian C# (AppId + folder + nama file berbeda)
; sehingga keduanya bisa terinstal sekaligus.
#define MyAppName "Hajat Manager (Flutter)"
#define MyAppVersion "1.0.1"
#define MyAppPublisher "Rahmad Widiansyah"
#define MyAppExeName "hajat_manager.exe"

[Setup]
AppId={{3d36b868-c0f3-4e3b-b5db-6c5a0a1980b7}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\Hajat Manager Flutter
DefaultGroupName={#MyAppName}
; lowest = tanpa UAC/admin (install ke Local Programs bila bukan admin).
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=..\release
OutputBaseFilename=Hajat-Manager-Flutter-{#MyAppVersion}-windows-x64-Setup
Compression=lzma2/max
SolidCompression=yes
; Flutter bundle x64 (engine + icudtl + plugins).
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
WizardStyle=modern
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\{#MyAppExeName}
; Data lokal (%AppData%\HajatManager) TIDAK dihapus saat uninstall.

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Buat ikon Desktop"; Flags: unchecked

[Files]
Source: "..\..\mobile\build\windows\x64\runner\Release\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Jalankan Hajat Manager (Flutter)"; Flags: nowait postinstall skipifsilent
