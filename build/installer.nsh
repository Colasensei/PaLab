; Palab NSIS 安装脚本（electron-builder nsis.include）
;
; 作用：
;   1. 覆盖安装前先结束正在运行的 Palab，避免 exe/dll 被占用导致"无法写入文件"。
;      Electron 应用经常留下后台进程，这是"必须卸载旧的才能装新的"最常见原因。
;   2. 旧版本的卸载注册项如果 InstallLocation 为空，静默卸载会失败，
;      这里在安装前把这条坏掉的注册项删掉，让安装器按"全新安装"处理。

!macro customInit
  ; 结束所有实例（没在运行也没关系，返回值忽略）
  nsExec::Exec 'taskkill /F /IM Palab.exe'
  Sleep 800

  ; 旧版本可能留下 InstallLocation 为空的卸载项，静默卸载会卡住
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\79079a92-7310-5a06-a43f-3592ef5644a2" "InstallLocation"
  ${If} $0 == ""
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\79079a92-7310-5a06-a43f-3592ef5644a2"
  ${EndIf}
  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\79079a92-7310-5a06-a43f-3592ef5644a2" "InstallLocation"
  ${If} $0 == ""
    DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\79079a92-7310-5a06-a43f-3592ef5644a2"
  ${EndIf}
!macroend
