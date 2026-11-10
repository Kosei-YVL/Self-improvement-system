Option Explicit
Dim shell, fso, root, node, candidate, command, result, failure, message, errorFile, stream, stopping
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
stopping = False
If WScript.Arguments.Count > 0 Then stopping = (WScript.Arguments(0) = "--stop")
If stopping Then
  If MsgBox("Focusの画面を閉じてから終了してください。", vbOKCancel + vbInformation, "Focus") <> vbOK Then WScript.Quit 0
End If
node = "node.exe"
For Each candidate In Array(shell.ExpandEnvironmentStrings("%ProgramW6432%") & "\nodejs\node.exe", shell.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe", shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Programs\nodejs\node.exe")
  If fso.FileExists(candidate) Then
    node = candidate
    Exit For
  End If
Next
If fso.FileExists(fso.BuildPath(root, "runtime\node-v24.19.0\node.exe")) Then node = fso.BuildPath(root, "runtime\node-v24.19.0\node.exe")
errorFile = fso.BuildPath(fso.GetSpecialFolder(2), fso.GetTempName)
command = Quote(node) & " " & Quote(fso.BuildPath(root, "focus-launcher.mjs")) & " --error-file " & Quote(errorFile)
If stopping Then command = command & " --stop"
If WScript.Arguments.Count > 0 Then
  If WScript.Arguments(0) = "--server-only" Then command = command & " --no-open"
End If
shell.CurrentDirectory = root
On Error Resume Next
result = shell.Run(command, 0, True)
failure = Err.Number
Err.Clear
On Error GoTo 0
If failure <> 0 Then
  MsgBox "Node.jsを起動できません。インストール後はFocusを開き直してください。", vbExclamation, "Focus"
  WScript.Quit 1
End If
If result <> 0 Then
  message = "Focusを起動できませんでした。Node.js 24以上が必要です。"
  If stopping Then message = "Focusを終了できませんでした。"
  If fso.FileExists(errorFile) Then
    Set stream = fso.OpenTextFile(errorFile, 1, False, -1)
    message = stream.ReadAll
    stream.Close
  End If
  MsgBox message, vbExclamation, "Focus"
End If
If fso.FileExists(errorFile) Then fso.DeleteFile errorFile, True
WScript.Quit result
Function Quote(value)
  Quote = Chr(34) & value & Chr(34)
End Function
