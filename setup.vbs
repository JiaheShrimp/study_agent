Dim scriptDir, appPath
scriptDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
appPath = scriptDir & "app.py"

Dim ws
Set ws = CreateObject("WScript.Shell")
ws.Run "pythonw " & Chr(34) & appPath & Chr(34), 0, False
