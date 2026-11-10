Target amd64-unicode
Unicode true
!include "FileFunc.nsh"
!include "LogicLib.nsh"
Name "Focus"
OutFile "${OUTFILE}"
Icon "${ICONFILE}"
RequestExecutionLevel user
SilentInstall silent
AutoCloseWindow true
SetCompressor /SOLID lzma
Var params
Var errorFile
Var result
Section
  ${GetParameters} $params
  ${IfNot} ${FileExists} "$EXEDIR\runtime\node-v24.19.0\node.exe"
    MessageBox MB_OK|MB_ICONEXCLAMATION "Focusの実行環境が見つかりません。インストーラーをもう一度実行してください。"
    SetErrorLevel 1
    Quit
  ${EndIf}
  GetTempFileName $errorFile
  StrCmp $params "--stop" known
  StrCmp $params "--connect" known
  StrCmp $params "--server-only" known
  StrCmp $params "--updated" known
  StrCpy $params ""
  known:
  nsExec::ExecToStack /TIMEOUT=60000 '"$EXEDIR\runtime\node-v24.19.0\node.exe" "$EXEDIR\desktop-tools.mjs" $params --error-file "$errorFile"'
  Pop $result
  Pop $0
  StrCmp $result "0" done
  FileOpen $1 $errorFile r
  IfErrors fallback
  FileReadUTF16LE $1 $0
  FileClose $1
  StrCmp $0 "" fallback
  MessageBox MB_OK|MB_ICONEXCLAMATION "$0"
  Goto failed
  fallback:
  MessageBox MB_OK|MB_ICONEXCLAMATION "Focusを起動できませんでした。記録の保存先にあるdesktop-server.logを確認してください。"
  failed:
  SetErrorLevel 1
  done:
  Delete $errorFile
SectionEnd
