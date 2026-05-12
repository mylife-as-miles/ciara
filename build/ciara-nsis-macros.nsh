; ── CIARA — NSIS include (electron-builder nsis.include, prepended before installer.nsi) ──
; Must NOT be named installer.nsh: that shadows app-builder-lib's include/installer.nsh when
; installSection does !include "installer.nsh".
; Docs: https://www.electron.build/nsis
;
; Cursor-style "Select additional tasks" page: optional desktop shortcut, Explorer context
; menus, and user PATH. Start menu shortcut still comes from electron-builder defaults.

!include "LogicLib.nsh"
!include "WinMessages.nsh"
!include "WordFunc.nsh"

!ifndef BUILD_UNINSTALLER
Var CIARA_TASK_DESKTOP
Var CIARA_TASK_FILECTX
Var CIARA_TASK_DIRCTX
Var CIARA_TASK_PATH
Var CIARA_HWND_DSK
Var CIARA_HWND_FILE
Var CIARA_HWND_DIR
Var CIARA_HWND_PATH
Var CIARA_TASKS_DLG
!endif

; MUI_INSTFILESPAGE_* must be defined before installer.nsi includes assistedInstaller.nsh
; (which inserts MUI_PAGE_INSTFILES).
!ifndef BUILD_UNINSTALLER
!ifndef ONE_CLICK
!define MUI_INSTFILESPAGE_HEADER_TITLE "Installing CIARA"
!define MUI_INSTFILESPAGE_HEADER_SUBTITLE "Follow status in the list below. Expand Show details if the detailed log is hidden. A numeric percentage is not available while files are unpacked from the archive."
!endif
!endif

!ifdef BUILD_UNINSTALLER
!define MUI_UNINSTFILESPAGE_HEADER_SUBTITLE "Removal progress is listed under Show details if the detailed log is hidden."
!endif

!macro preInit
  !ifndef BUILD_UNINSTALLER
    ; Silent installs skip the custom tasks page — match assisted defaults (PATH on, rest off).
    StrCpy $CIARA_TASK_DESKTOP "0"
    StrCpy $CIARA_TASK_FILECTX "0"
    StrCpy $CIARA_TASK_DIRCTX "0"
    StrCpy $CIARA_TASK_PATH "1"
  !endif
!macroend

!ifndef BUILD_UNINSTALLER
!ifndef ONE_CLICK
!include "nsDialogs.nsh"

Function CIARA_ShowSetupSteps
  nsDialogs::Create 1018
  Pop $CIARA_TASKS_DLG
  ${NSD_CreateLabel} 5u 2u 100% 12u "What happens during setup"
  Pop $0
  ${NSD_CreateLabel} 5u 16u 100% 120u "This installer runs in four stages. On the next screen, choose optional Windows integration (desktop shortcut, Explorer menus, PATH). Then expand Show details on the install page for Step 1–4 messages in the log.$\r$\n$\r$\n1 - Safety: confirms CIARA is not running; replaces a previous install when upgrading.$\r$\n$\r$\n2 - Files: extracts the desktop app (Electron UI, Python/backend bundle, bundled Chrome extension assets) into your chosen folder.$\r$\n$\r$\n3 - Registration: uninstall information, Start Menu shortcut, and any extra tasks you select.$\r$\n$\r$\n4 - Finish: optionally launch CIARA from the last wizard page.$\r$\n$\r$\nClick Next to continue. Extraction can take a minute on slower disks."
  Pop $0
  nsDialogs::Show
FunctionEnd

Function CIARA_LeaveSetupSteps
FunctionEnd

Function CIARA_ShowAdditionalTasks
  ${If} ${Silent}
    Abort
  ${EndIf}
  nsDialogs::Create 1018
  Pop $CIARA_TASKS_DLG

  ${NSD_CreateLabel} 5u 2u 100% 12u "Select additional tasks"
  Pop $0
  ${NSD_CreateLabel} 5u 16u 100% 24u "Choose how CIARA integrates with Windows (you can change these later by reinstalling)."
  Pop $0

  ${NSD_CreateLabel} 5u 44u 100% 12u "Optional shortcuts and integration"
  Pop $0

  ${NSD_CreateCheckbox} 5u 62u 280u 12u "Create a desktop icon"
  Pop $CIARA_HWND_DSK
  SendMessage $CIARA_HWND_DSK ${BM_SETCHECK} ${BST_UNCHECKED} 0

  ${NSD_CreateCheckbox} 5u 80u 280u 12u "Add $\'Open with CIARA$\' to the file context menu in Windows Explorer"
  Pop $CIARA_HWND_FILE
  SendMessage $CIARA_HWND_FILE ${BM_SETCHECK} ${BST_UNCHECKED} 0

  ${NSD_CreateCheckbox} 5u 98u 280u 12u "Add $\'Open with CIARA$\' to the folder context menu in Windows Explorer"
  Pop $CIARA_HWND_DIR
  SendMessage $CIARA_HWND_DIR ${BM_SETCHECK} ${BST_UNCHECKED} 0

  ${NSD_CreateCheckbox} 5u 116u 280u 24u "Add CIARA to your user PATH (for terminals and scripts; restart terminals after install)"
  Pop $CIARA_HWND_PATH
  SendMessage $CIARA_HWND_PATH ${BM_SETCHECK} ${BST_CHECKED} 0

  nsDialogs::Show
FunctionEnd

Function CIARA_LeaveAdditionalTasks
  ${NSD_GetState} $CIARA_HWND_DSK $CIARA_TASK_DESKTOP
  ${NSD_GetState} $CIARA_HWND_FILE $CIARA_TASK_FILECTX
  ${NSD_GetState} $CIARA_HWND_DIR $CIARA_TASK_DIRCTX
  ${NSD_GetState} $CIARA_HWND_PATH $CIARA_TASK_PATH
FunctionEnd

!macro customPageAfterChangeDir
  Page custom CIARA_ShowSetupSteps CIARA_LeaveSetupSteps
  Page custom CIARA_ShowAdditionalTasks CIARA_LeaveAdditionalTasks
!macroend
!endif
!endif

!macro customHeader
  ; Last ShowInstDetails / ShowUninstDetails wins (overrides common.nsh nevershow).
  ShowInstDetails show
  !ifdef BUILD_UNINSTALLER
    ShowUninstDetails show
  !endif
!macroend

; ── Apply / remove optional integration (installer defines DO_NOT_CREATE_DESKTOP_SHORTCUT) ──
!macro customInstall
  ${If} $CIARA_TASK_DESKTOP == 1
    DetailPrint "CIARA tasks: creating desktop shortcut..."
    CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
    WinShell::SetLnkAUMI "$DESKTOP\${SHORTCUT_NAME}.lnk" "${APP_ID}"
  ${EndIf}

  ${If} $CIARA_TASK_FILECTX == 1
    DetailPrint "CIARA tasks: file context menu..."
    WriteRegStr HKCU "Software\Classes\*\shell\CIARA" "" "Open with CIARA"
    WriteRegStr HKCU "Software\Classes\*\shell\CIARA\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  ${EndIf}

  ${If} $CIARA_TASK_DIRCTX == 1
    DetailPrint "CIARA tasks: folder context menus..."
    WriteRegStr HKCU "Software\Classes\Directory\shell\CIARA" "" "Open with CIARA"
    WriteRegStr HKCU "Software\Classes\Directory\shell\CIARA\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
    WriteRegStr HKCU "Software\Classes\Directory\Background\shell\CIARA" "" "Open with CIARA here"
    WriteRegStr HKCU "Software\Classes\Directory\Background\shell\CIARA\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%V"'
  ${EndIf}

  ${If} $CIARA_TASK_PATH == 1
    DetailPrint "CIARA tasks: updating user PATH..."
    ReadRegStr $R0 HKCU "Environment" "Path"
    StrLen $R2 $INSTDIR
    StrLen $R3 $R0
    ; If PATH is empty or shorter than INSTDIR, it cannot already contain INSTDIR.
    StrCmp $R0 "" ciaraPathAppend
    IntCmp $R3 $R2 ciaraPathScanStart ciaraPathAppend ciaraPathScanStart
    ciaraPathScanStart:
      IntOp $R4 $R3 - $R2
      StrCpy $R5 0
    ciaraPathScan:
      IntCmp $R5 $R4 ciaraPathAppend 0 ciaraPathAppend
      StrCpy $R6 $R0 $R2 $R5
      StrCmp $R6 $INSTDIR ciaraPathBlockEnd 0
      IntOp $R5 $R5 + 1
      Goto ciaraPathScan
    ciaraPathAppend:
      StrCmp $R0 "" ciaraPathEmpty ciaraPathNonEmpty
    ciaraPathEmpty:
      WriteRegStr HKCU "Environment" "Path" $INSTDIR
      Goto ciaraPathBroadcast
    ciaraPathNonEmpty:
      WriteRegStr HKCU "Environment" "Path" "$R0;$INSTDIR"
    ciaraPathBroadcast:
      SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=2000
    ciaraPathBlockEnd:
  ${EndIf}
!macroend

!macro customUnInstall
  DetailPrint "CIARA tasks: removing optional Explorer menus and PATH entry..."
  DeleteRegKey HKCU "Software\Classes\*\shell\CIARA"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\CIARA"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\CIARA"

  ReadRegStr $R0 HKCU "Environment" "Path"
  StrCmp $R0 "" ciaraUnPathDone 0
  ${WordReplace} "$R0" ";$INSTDIR" "" "+S" $R0
  ${WordReplace} "$R0" "$INSTDIR;" "" "+S" $R0
  ${WordReplace} "$R0" "$INSTDIR" "" "" $R0
  StrCmp $R0 "" ciaraUnPathDelete ciaraUnPathWrite
  ciaraUnPathDelete:
    DeleteRegValue HKCU "Environment" "Path"
    Goto ciaraUnPathBroadcast
  ciaraUnPathWrite:
    WriteRegStr HKCU "Environment" "Path" $R0
  ciaraUnPathBroadcast:
    SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=2000
  ciaraUnPathDone:

  Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
!macroend
