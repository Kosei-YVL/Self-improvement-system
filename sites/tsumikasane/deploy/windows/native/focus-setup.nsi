Target amd64-unicode
Unicode true
!include "MUI2.nsh"
!include "x64.nsh"
!include "WinVer.nsh"
Name "Focus"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\Focus"
InstallDirRegKey HKCU "Software\Focus" "InstallLocation"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 32
ShowInstDetails show
ShowUninstDetails show
BrandingText "Focus"
!ifndef PRODUCT_VERSION
!define PRODUCT_VERSION "2.6.29.0"
!endif
!ifndef APP_VERSION
!define APP_VERSION "2026.10.29"
!endif
VIProductVersion "${PRODUCT_VERSION}"
VIAddVersionKey /LANG=1041 "ProductName" "Focus"
VIAddVersionKey /LANG=1041 "FileDescription" "Focus セットアップ"
VIAddVersionKey /LANG=1041 "FileVersion" "${APP_VERSION}"
!define MUI_ICON "${ICONFILE}"
!define MUI_UNICON "${ICONFILE}"
!define MUI_DIRECTORYPAGE_TEXT_TOP "初めて使う場合はそのまま進みます。既存のFocusを更新する場合は、server.mjsが入っている現在のFocusフォルダーを選んでください。記録・同期キー・Google設定は引き継ぎます。"
!define MUI_FINISHPAGE_RUN "$INSTDIR\Focus.exe"
!define MUI_FINISHPAGE_RUN_PARAMETERS "--updated"
!define MUI_FINISHPAGE_RUN_TEXT "Focusを開く"
!define MUI_FINISHPAGE_TEXT "Focusをインストールしました。デスクトップまたはスタートメニューから起動できます。iPhone・iPadの追加は、スタートメニューの「Focus → iPhone・iPadを接続」を開いてください。"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Japanese"
Var result
Var errorFile
Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONEXCLAMATION "この版は64ビット版Windows用です。"
    Abort
  ${EndIf}
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_OK|MB_ICONEXCLAMATION "Windows 10以降が必要です。"
    Abort
  ${EndIf}
  SetShellVarContext current
  SetRegView 64
FunctionEnd
Section "Focus"
  InitPluginsDir
  SetOutPath "$PLUGINSDIR\package"
  File /r "${PACKAGEROOT}\*.*"
  SetOutPath "$PLUGINSDIR\runtime"
  File "${RUNTIMEROOT}\node.exe"
  File "${RUNTIMEROOT}\LICENSE"
  File "${RUNTIMEROOT}\runtime.json"
  GetTempFileName $errorFile
  DetailPrint "記録の保存先を確認し、更新前の控えを作成します。"
  nsExec::ExecToStack /TIMEOUT=180000 '"$PLUGINSDIR\runtime\node.exe" "$PLUGINSDIR\package\install-focus-windows.mjs" --target "$INSTDIR" --package "$PLUGINSDIR\package" --runtime "$PLUGINSDIR\runtime" --data "$LOCALAPPDATA\Focus\data\personal" --error-file "$errorFile"'
  Pop $result
  Pop $0
  StrCmp $result "0" installed
  FileOpen $1 $errorFile r
  IfErrors failed
  FileReadUTF16LE $1 $0
  FileClose $1
  StrCmp $0 "" failed
  MessageBox MB_OK|MB_ICONEXCLAMATION "$0"
  Goto abortInstall
  failed:
  MessageBox MB_OK|MB_ICONEXCLAMATION "インストールを完了できませんでした。現在のFocusフォルダーを選択し直してください。"
  abortInstall:
  Delete $errorFile
  SetErrorLevel 1
  Abort
  installed:
  Delete $errorFile
  SetOutPath "$INSTDIR"
  File /oname=Focus.exe "${LAUNCHER}"
  File /oname=desktop-tools.mjs "${TOOLSSCRIPT}"
  File /oname=FOCUS-INSTALL.md "${GUIDEFILE}"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\Focus"
  CreateShortCut "$DESKTOP\Focus.lnk" "$INSTDIR\Focus.exe" "" "$INSTDIR\focus.ico"
  CreateShortCut "$SMPROGRAMS\Focus\Focus.lnk" "$INSTDIR\Focus.exe" "" "$INSTDIR\focus.ico"
  CreateShortCut "$SMPROGRAMS\Focus\iPhone・iPadを接続.lnk" "$INSTDIR\Focus.exe" "--connect" "$INSTDIR\focus.ico"
  CreateShortCut "$SMPROGRAMS\Focus\Focusを終了.lnk" "$INSTDIR\Focus.exe" "--stop" "$INSTDIR\focus.ico"
  CreateShortCut "$SMPROGRAMS\Focus\アンインストール.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortCut "$SMSTARTUP\Focus Sync.lnk" "$INSTDIR\Focus.exe" "--server-only" "$INSTDIR\focus.ico"
  SetRegView 32
  WriteRegStr HKCU "Software\Focus" "InstallLocation" "$INSTDIR"
  SetRegView 64
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Focus" "DisplayName" "Focus"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Focus" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Focus" "DisplayIcon" "$INSTDIR\focus.ico"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Focus" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Focus" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Focus" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Focus" "NoRepair" 1
SectionEnd
Section "Uninstall"
  SetShellVarContext current
  SetRegView 64
  nsExec::ExecToStack /TIMEOUT=30000 '"$INSTDIR\runtime\node-v24.19.0\node.exe" "$INSTDIR\desktop-tools.mjs" --stop'
  Pop $result
  Pop $0
  StrCmp $result "0" stopped
  MessageBox MB_OK|MB_ICONEXCLAMATION "Focusの同期処理を終了できませんでした。起動中のFocusを閉じてから再実行してください。記録は残っています。"
  Abort
  stopped:
  !include "${DELETEFILES}"
  Delete "$INSTDIR\Focus.exe"
  Delete "$INSTDIR\desktop-tools.mjs"
  Delete "$INSTDIR\FOCUS-INSTALL.md"
  Delete "$INSTDIR\Uninstall.exe"
  Delete "$DESKTOP\Focus.lnk"
  Delete "$SMPROGRAMS\Focus\Focus.lnk"
  Delete "$SMPROGRAMS\Focus\iPhone・iPadを接続.lnk"
  Delete "$SMPROGRAMS\Focus\Focusを終了.lnk"
  Delete "$SMPROGRAMS\Focus\アンインストール.lnk"
  RMDir "$SMPROGRAMS\Focus"
  Delete "$SMSTARTUP\Focus Sync.lnk"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Focus"
  ; Keep installation.json, all browser data and all runtime records/backups.
  DetailPrint "記録・バックアップとinstallation.jsonは保存先に残しました。"
SectionEnd
