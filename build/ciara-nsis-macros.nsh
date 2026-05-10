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

!macro customHeader
  ; Last ShowInstDetails / ShowUninstDetails wins (overrides common.nsh nevershow).
  ShowInstDetails show
  !ifdef BUILD_UNINSTALLER
    ShowUninstDetails show
  !endif
!macroend
