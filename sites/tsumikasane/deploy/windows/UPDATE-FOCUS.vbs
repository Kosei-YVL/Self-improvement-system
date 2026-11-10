Option Explicit
Dim shell, fso, picker, folder, source, destination, node, candidate, command, result, failure, message, errorFile, stream, shortcut, place, target
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
source = fso.GetParentFolderName(WScript.ScriptFullName)
Set picker = CreateObject("Shell.Application")
Set folder = picker.BrowseForFolder(0, "Focusの画面を閉じ、今使っているFocusフォルダーを選んでください。データを残して更新します。", &H41, source)
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
command = Quote(node) & " " & Quote(fso.BuildPath(source, "updater.mjs")) & " --target " & Quote(destination) & " --error-file " & Quote(errorFile)
shell.CurrentDirectory = source
On Error Resume Next
result = shell.Run(command, 0, True)
failure = Err.Number
Err.Clear
On Error GoTo 0
If failure <> 0 Then
  MsgBox "Node.jsを起動できません。インストール後は更新をやり直してください。", vbExclamation, "Focus"
  WScript.Quit 1
End If
If result <> 0 Then
  message = "Focusを更新できませんでした。"
  If fso.FileExists(errorFile) Then
    Set stream = fso.OpenTextFile(errorFile, 1, False, -1)
    message = stream.ReadAll
    stream.Close
  End If
  MsgBox message, vbExclamation, "Focus"
End If
If result = 0 Then
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
  Err.Clear
  On Error GoTo 0
End If
If fso.FileExists(errorFile) Then fso.DeleteFile errorFile, True
WScript.Quit result
Function Quote(value)
  Quote = Chr(34) & value & Chr(34)
End Function
