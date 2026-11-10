Option Explicit
Dim shell, fso, picker, folder, source, destination, node, candidate, command, result, failure, errorFile, stream, message, shortcut, place, target
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
source = fso.GetParentFolderName(WScript.ScriptFullName)
Set picker = CreateObject("Shell.Application")
Set folder = picker.BrowseForFolder(0, "Focusの画面を閉じ、今使っているFocusフォルダーを選んでください。更新とiPhone・iPadの接続を準備します。", &H41, source)
If folder Is Nothing Then WScript.Quit 0
destination = folder.Self.Path
node = "node.exe"
For Each candidate In Array(shell.ExpandEnvironmentStrings("%ProgramW6432%") & "\nodejs\node.exe", shell.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe", shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Programs\nodejs\node.exe")
  If fso.FileExists(candidate) Then
    node = candidate
    Exit For
  End If
Next
errorFile = fso.BuildPath(fso.GetSpecialFolder(2), fso.GetTempName)
command = Quote(node) & " " & Quote(fso.BuildPath(source, "connect-focus.mjs")) & " --target " & Quote(destination) & " --error-file " & Quote(errorFile)
shell.CurrentDirectory = source
On Error Resume Next
result = shell.Run(command, 0, True)
failure = Err.Number
Err.Clear
On Error GoTo 0
If failure <> 0 Then
  MsgBox "Node.jsを起動できません。Node.js 24以上を入れてから再実行してください。", vbExclamation, "Focus"
  WScript.Quit 1
End If
If result = 0 Or result = 2 Then
  On Error Resume Next
  target = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\wscript.exe"
  For Each place In Array(shell.SpecialFolders("Desktop"), shell.SpecialFolders("Programs"))
    Set shortcut = shell.CreateShortcut(fso.BuildPath(place, "Focus.lnk"))
    shortcut.TargetPath = target
    shortcut.Arguments = Quote(fso.BuildPath(destination, "Focus.vbs"))
    shortcut.WorkingDirectory = destination
    shortcut.IconLocation = fso.BuildPath(destination, "focus.ico") & ",0"
    shortcut.Save
  Next
  Set shortcut = shell.CreateShortcut(fso.BuildPath(shell.SpecialFolders("Programs"), "Focusを終了.lnk"))
  shortcut.TargetPath = target
  shortcut.Arguments = Quote(fso.BuildPath(destination, "Focus.vbs")) & " --stop"
  shortcut.WorkingDirectory = destination
  shortcut.IconLocation = fso.BuildPath(destination, "focus.ico") & ",0"
  shortcut.Save
  If result = 0 Then
    Set shortcut = shell.CreateShortcut(fso.BuildPath(shell.SpecialFolders("Startup"), "Focus Sync.lnk"))
    shortcut.TargetPath = target
    shortcut.Arguments = Quote(fso.BuildPath(destination, "Focus.vbs")) & " --server-only"
    shortcut.WorkingDirectory = destination
    shortcut.IconLocation = fso.BuildPath(destination, "focus.ico") & ",0"
    shortcut.Save
  End If
  Err.Clear
  On Error GoTo 0
  If result = 2 Then MsgBox "Focusの更新は完了しました。表示された案内でTailscaleを準備した後、START-HERE.vbsをもう一度開いてください。", vbInformation, "Focus"
Else
  message = "Focusの更新・接続を完了できませんでした。"
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
