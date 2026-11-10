Option Explicit
Dim shell, fso, picker, folder, source, destination, node, candidate, command, result, failure, errorFile, stream, message, shortcut
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
source = fso.GetParentFolderName(WScript.ScriptFullName)
Set picker = CreateObject("Shell.Application")
Set folder = picker.BrowseForFolder(0, "今使っているFocusフォルダーを選んでください。PCとiPhoneのTailscaleは同じアカウントで接続してください。", &H41, source)
If folder Is Nothing Then WScript.Quit 0
destination = folder.Self.Path
node = "node.exe"
For Each candidate In Array(shell.ExpandEnvironmentStrings("%ProgramW6432%") & "\nodejs\node.exe", shell.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe")
  If fso.FileExists(candidate) Then
    node = candidate
    Exit For
  End If
Next
errorFile = fso.BuildPath(fso.GetSpecialFolder(2), fso.GetTempName)
command = Quote(node) & " " & Quote(fso.BuildPath(source, "setup-network.mjs")) & " --target " & Quote(destination) & " --error-file " & Quote(errorFile)
On Error Resume Next
result = shell.Run(command, 0, True)
failure = Err.Number
On Error GoTo 0
If failure <> 0 Then
  MsgBox "Node.jsを起動できません。", vbExclamation, "Focus"
  WScript.Quit 1
End If
If result <> 0 Then
  message = "接続設定を完了できませんでした。"
  If fso.FileExists(errorFile) Then
    Set stream = fso.OpenTextFile(errorFile, 1, False, -1)
    message = stream.ReadAll
    stream.Close
  End If
  MsgBox message, vbExclamation, "Focus"
Else
  On Error Resume Next
  Set shortcut = shell.CreateShortcut(fso.BuildPath(shell.SpecialFolders("Startup"), "Focus Sync.lnk"))
  shortcut.TargetPath = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\wscript.exe"
  shortcut.Arguments = Quote(fso.BuildPath(destination, "Focus.vbs")) & " --server-only"
  shortcut.WorkingDirectory = destination
  shortcut.IconLocation = fso.BuildPath(destination, "focus.ico") & ",0"
  shortcut.Save
  On Error GoTo 0
End If
If fso.FileExists(errorFile) Then fso.DeleteFile errorFile, True
WScript.Quit result
Function Quote(value)
  Quote = Chr(34) & value & Chr(34)
End Function
