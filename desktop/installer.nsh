; Windows executable compression is transparent to the loader and does not
; change file contents/hashes. It is optional: unsupported filesystems, locked
; files or compact failures leave a usable ordinary installation.
; Exact application filenames only. Never recurse or touch AppData/user files.
!macro TemuraCompactFile FILE
  IfFileExists "$INSTDIR\${FILE}" 0 +3
    nsExec::ExecToLog '"$SYSDIR\compact.exe" /C /I /Q /EXE:XPRESS16K "$INSTDIR\${FILE}"'
    Pop $0
!macroend

!macro customInstall
  Push $0
  !insertmacro TemuraCompactFile "${APP_EXECUTABLE_FILENAME}"
  !insertmacro TemuraCompactFile "chrome_100_percent.pak"
  !insertmacro TemuraCompactFile "chrome_200_percent.pak"
  !insertmacro TemuraCompactFile "d3dcompiler_47.dll"
  !insertmacro TemuraCompactFile "dxcompiler.dll"
  !insertmacro TemuraCompactFile "dxil.dll"
  !insertmacro TemuraCompactFile "ffmpeg.dll"
  !insertmacro TemuraCompactFile "icudtl.dat"
  !insertmacro TemuraCompactFile "LICENSES.chromium.html"
  !insertmacro TemuraCompactFile "resources.pak"
  !insertmacro TemuraCompactFile "snapshot_blob.bin"
  !insertmacro TemuraCompactFile "v8_context_snapshot.bin"
  !insertmacro TemuraCompactFile "vk_swiftshader.dll"
  !insertmacro TemuraCompactFile "vulkan-1.dll"
  !insertmacro TemuraCompactFile "resources\app.asar"
  !insertmacro TemuraCompactFile "resources\elevate.exe"
  !insertmacro TemuraCompactFile "locales\he.pak"
  !insertmacro TemuraCompactFile "locales\en-US.pak"
  !insertmacro TemuraCompactFile "locales\en-GB.pak"
  Pop $0
!macroend
