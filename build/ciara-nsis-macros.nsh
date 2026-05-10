; ── CIARA — NSIS include (electron-builder nsis.include, prepended before installer.nsi) ──
; Must NOT be named installer.nsh: that shadows app-builder-lib's include/installer.nsh when
; installSection does !include "installer.nsh".
; Docs: https://www.electron.build/nsis
;
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

; ── Optional wizard page after install-folder selection: explains setup phases ──
!ifndef BUILD_UNINSTALLER
!ifndef ONE_CLICK
!include "nsDialogs.nsh"

Var CIARA_SETUP_STEPS_DLG

Function CIARA_ShowSetupSteps
  nsDialogs::Create 1018
  Pop $CIARA_SETUP_STEPS_DLG
  ${NSD_CreateLabel} 5u 2u 100% 14u "What happens during setup"
  Pop $0
  ${NSD_CreateLabel} 5u 20u 100% 154u "This installer runs in four stages. On the next screen, expand Show details for live Step 1 through 4 messages in the installation log.$\r$\n$\r$\n1 - Safety: confirms CIARA is not running; replaces a previous install when upgrading.$\r$\n$\r$\n2 - Files: extracts the desktop app (Electron UI, Python/backend bundle, bundled Chrome extension assets) into your chosen folder.$\r$\n$\r$\n3 - Registration: uninstall information and Start Menu/Desktop shortcuts.$\r$\n$\r$\n4 - Finish: optionally launch CIARA from the last wizard page.$\r$\n$\r$\nClick Next to begin. Extraction can take a minute on slower disks."
  Pop $0
  nsDialogs::Show
FunctionEnd

Function CIARA_LeaveSetupSteps
FunctionEnd

!macro customPageAfterChangeDir
  Page custom CIARA_ShowSetupSteps CIARA_LeaveSetupSteps
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
