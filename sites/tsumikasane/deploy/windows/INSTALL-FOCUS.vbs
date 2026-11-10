Option Explicit
Dim shell, fso, source, destination, picker, folder, files, name, shortcut, target, installed, appName, runtimePath, stream, runtime
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
source = fso.GetParentFolderName(WScript.ScriptFullName)
destination = source
If Not IsFocus(destination) Then
  Set picker = CreateObject("Shell.Application")
  Set folder = picker.BrowseForFolder(0, "以前のSTART-WINDOWS.cmdがあるFocusフォルダーを選んでください。", &H41, source)
  If folder Is Nothing Then WScript.Quit 0
  destination = folder.Self.Path
End If
If Not IsFocus(destination) Then
  MsgBox "Focusが見つかりません。START-WINDOWS.cmdとpersonalフォルダーがある場所を選んでください。", vbExclamation, "Focus"
  WScript.Quit 1
End If
appName = "Focus"
runtimePath = fso.BuildPath(destination, "web\focus-runtime.mjs")
If fso.FileExists(runtimePath) Then
  Set stream = fso.OpenTextFile(runtimePath, 1)
  runtime = stream.ReadAll
  stream.Close
  If InStr(runtime, "FOCUS_ENV=" & Chr(34) & "development" & Chr(34)) > 0 Then appName = "Focus (開発)"
End If
files = Array("Focus.vbs", "INSTALL-FOCUS.vbs", "focus-launcher.mjs", "focus.ico", "FOCUS-WINDOWS.md")
For Each name In files
  If Not fso.FileExists(fso.BuildPath(source, name)) Then
    MsgBox "ZIPをすべて展開してから、INSTALL-FOCUS.vbsを開いてください。", vbExclamation, "Focus"
    WScript.Quit 1
  End If
Next
On Error Resume Next
For Each name In files
  If LCase(source) <> LCase(destination) Then fso.CopyFile fso.BuildPath(source, name), fso.BuildPath(destination, name), True
  If Err.Number <> 0 Then Exit For
Next
If Err.Number <> 0 Then
  MsgBox "Focusフォルダーへ書き込めません。自分のドキュメントなど、保存できる場所で使ってください。", vbExclamation, "Focus"
  WScript.Quit 1
End If
On Error GoTo 0
target = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\wscript.exe"
On Error Resume Next
For Each installed In Array(shell.SpecialFolders("Desktop"), shell.SpecialFolders("Programs"))
  Set shortcut = shell.CreateShortcut(fso.BuildPath(installed, appName & ".lnk"))
  shortcut.TargetPath = target
  shortcut.Arguments = Quote(fso.BuildPath(destination, "Focus.vbs"))
  shortcut.WorkingDirectory = destination
  shortcut.IconLocation = fso.BuildPath(destination, "focus.ico") & ",0"
  shortcut.Description = appName
  shortcut.WindowStyle = 1
  shortcut.Save
  If Err.Number <> 0 Then Exit For
Next
If Err.Number = 0 Then
  Set shortcut = shell.CreateShortcut(fso.BuildPath(shell.SpecialFolders("Programs"), appName & "を終了.lnk"))
  shortcut.TargetPath = target
  shortcut.Arguments = Quote(fso.BuildPath(destination, "Focus.vbs")) & " --stop"
  shortcut.WorkingDirectory = destination
  shortcut.IconLocation = fso.BuildPath(destination, "focus.ico") & ",0"
  shortcut.Description = "Focusのローカルサーバーを終了"
  shortcut.Save
End If
If Err.Number <> 0 Then
  MsgBox "ショートカットを作成できませんでした。Focusフォルダー内のFocus.vbsから起動できます。", vbExclamation, "Focus"
  WScript.Quit 1
End If
On Error GoTo 0
MsgBox "デスクトップとスタートメニューに" & appName & "を追加しました。", vbInformation, "Focus"
shell.Run Quote(target) & " " & Quote(fso.BuildPath(destination, "Focus.vbs")), 1, False
Function IsFocus(path)
  IsFocus = (fso.FileExists(fso.BuildPath(path, "server.mjs")) And fso.FileExists(fso.BuildPath(path, "app-assets.json"))) Or (fso.FileExists(fso.BuildPath(path, "personal\server.mjs")) And fso.FileExists(fso.BuildPath(path, "personal\app-assets.json")))
End Function
Function Quote(value)
  Quote = Chr(34) & value & Chr(34)
End Function
