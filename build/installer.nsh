; Kabuk kurulum programina eklenenler (electron-builder, package.json > build.nsis.include)

; Guncelleme sirasinda: sag tik menusu eklentisi (KabukMenu.dll) Windows tarafindan yukluyse dosya
; kilitlidir. Eski surumun kaldiricisi kilitli bir dosya gorunce guncellemeyi tamamen iptal ediyor
; ("File is busy, aborting"). Yuklu bir DLL silinemez ama tasinabilir: once gecici klasore tasinir
; (orada silinemezse Windows gecici dosyalari kendisi temizler).
!macro customInit
  ${If} ${FileExists} "$INSTDIR\contextmenu\KabukMenu.dll"
    GetTempFileName $0
    Delete $0
    Rename "$INSTDIR\contextmenu\KabukMenu.dll" $0
    Delete $0
  ${EndIf}
!macroend

; Kabuk tamamen kaldirilinca (guncelleme degilse) sag tik menusundeki "Kabuk ile ac" da kaldirilir;
; yalnizca bu kurulu Kabuk'a aitse (contextmenu\uninstall.ps1 bakar)
!macro customUnInstall
  ${IfNot} ${isUpdated}
    System::Call 'Kernel32::SetEnvironmentVariable(t "KABUK_DIR", t "$INSTDIR")'
    System::Call 'Kernel32::SetEnvironmentVariable(t "KABUK_PS", t "$INSTDIR\contextmenu\uninstall.ps1")'
    nsExec::Exec `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create([IO.File]::ReadAllText($$env:KABUK_PS)))"`
    Pop $0
  ${EndIf}
!macroend
