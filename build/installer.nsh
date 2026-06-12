; Install Apple Mobile Device Support during Oversight Desktop setup (x64 MSI from koush/AppleMobileDeviceSupport).
; Skipped when registry shows drivers are already installed.

!macro customInstall
  ClearErrors
  ReadRegStr $0 HKLM "SOFTWARE\Apple Inc.\Apple Mobile Device Support" "Version"
  StrCmp $0 "" checkWow6432 skipDriverInstall
  checkWow6432:
    ReadRegStr $0 HKLM "SOFTWARE\WOW6432Node\Apple Inc.\Apple Mobile Device Support" "Version"
    StrCmp $0 "" doDriverInstall skipDriverInstall
  doDriverInstall:
    IfFileExists "$INSTDIR\resources\apple-drivers\AppleMobileDeviceSupport64.msi" 0 skipDriverInstall
    DetailPrint "Installing Apple Mobile Device Support (iPhone USB drivers)..."
    ExecWait '"msiexec.exe" /i "$INSTDIR\resources\apple-drivers\AppleMobileDeviceSupport64.msi" /quiet /norestart' $1
  skipDriverInstall:
!macroend
