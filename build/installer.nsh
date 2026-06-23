; Install Apple Mobile Device Support during Oversight Desktop setup (x64 MSI from koush/AppleMobileDeviceSupport).
; Skipped when registry shows drivers are already installed.
; Also adds a Windows Firewall inbound rule so the wireless photo import server
; can receive connections from phones without any runtime UAC prompt.

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

  ; Add Windows Firewall rule for Wireless Photo Import.
  ; Allows the Oversight Desktop process to accept inbound TCP connections from
  ; phones joined to the local Wi-Fi Direct network.  The installer already runs
  ; with administrator rights so no UAC prompt is needed during use.
  DetailPrint "Adding Windows Firewall rule for Wireless Photo Import..."
  ExecWait '"netsh" advfirewall firewall delete rule name="Oversight-Desktop-Wireless-Import"' $1
  ExecWait '"netsh" advfirewall firewall add rule name="Oversight-Desktop-Wireless-Import" dir=in action=allow program="$INSTDIR\Oversight Desktop.exe" profile=any' $1
!macroend

!macro customUnInstall
  ; Remove the firewall rule added during installation.
  ExecWait '"netsh" advfirewall firewall delete rule name="Oversight-Desktop-Wireless-Import"' $1
!macroend
