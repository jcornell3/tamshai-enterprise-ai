// TamshaiAiUnified.cpp : Defines the entry point for the application.
//

#include "pch.h"
#include "TamshaiAiUnified.h"

#include "AutolinkedNativeModules.g.h"

#include "NativeModules.h"
#include <winrt/Microsoft.ReactNative.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.System.h>
#include <winrt/Microsoft.UI.Dispatching.h>
#include <winrt/Windows.ApplicationModel.Activation.h>
#include <winrt/Microsoft.Windows.AppLifecycle.h>
#include <string>
#include <fstream>
#include <atomic>

// Global to store the initial URL from protocol activation
std::wstring g_initialUrl;

// Global for IPC file polling (checked by JS via native module)
std::atomic<bool> g_hasNewUrl{false};
std::wstring g_pendingUrl;

// Global to store the main window handle for bringing to foreground
HWND g_mainWindowHandle = nullptr;

// Mutex name for single-instance detection
const wchar_t* SINGLE_INSTANCE_MUTEX_NAME = L"TamshaiAiUnified_SingleInstance_Mutex";

// File path for IPC (simpler than named pipes)
std::wstring GetIpcFilePath() {
    wchar_t tempPath[MAX_PATH];
    GetTempPathW(MAX_PATH, tempPath);
    return std::wstring(tempPath) + L"tamshai_ai_callback_url.txt";
}

// Write URL to IPC file for running instance to pick up
void WriteUrlToIpcFile(const std::wstring& url) {
    std::wstring ipcPath = GetIpcFilePath();
    OutputDebugStringW(L"[IPC] IPC file path: ");
    OutputDebugStringW(ipcPath.c_str());
    OutputDebugStringW(L"\n");

    std::wofstream file(ipcPath, std::ios::trunc);
    if (file.is_open()) {
        file << url;
        file.close();
        OutputDebugStringW(L"[IPC] SUCCESS - Wrote URL to IPC file: ");
        OutputDebugStringW(url.c_str());
        OutputDebugStringW(L"\n");
    } else {
        OutputDebugStringW(L"[IPC] ERROR - Failed to open IPC file for writing!\n");
    }
}

// Read URL from IPC file
std::wstring ReadUrlFromIpcFile() {
    std::wstring ipcPath = GetIpcFilePath();
    std::wifstream file(ipcPath);
    std::wstring url;
    if (file.is_open()) {
        std::getline(file, url);
        file.close();
        // Delete the file after reading
        DeleteFileW(ipcPath.c_str());
        if (!url.empty()) {
            OutputDebugStringW(L"[IPC] Read URL from IPC file: ");
            OutputDebugStringW(url.c_str());
            OutputDebugStringW(L"\n");
        }
    }
    return url;
}

// Clear any stale IPC file on startup
void ClearStaleIpcFile() {
    std::wstring ipcPath = GetIpcFilePath();
    OutputDebugStringW(L"[IPC] Checking for stale IPC file: ");
    OutputDebugStringW(ipcPath.c_str());
    OutputDebugStringW(L"\n");
    if (DeleteFileW(ipcPath.c_str())) {
        OutputDebugStringW(L"[IPC] SUCCESS - Cleared stale IPC file on startup\n");
    } else {
        DWORD err = GetLastError();
        if (err == ERROR_FILE_NOT_FOUND) {
            OutputDebugStringW(L"[IPC] No stale IPC file found (good)\n");
        } else {
            OutputDebugStringW(L"[IPC] Failed to delete IPC file, error: ");
            OutputDebugStringW(std::to_wstring(err).c_str());
            OutputDebugStringW(L"\n");
        }
    }
}

// =============================================================================
// DeepLinkModule - Native module to expose protocol activation URL to JS
// This works around a known issue in React Native Windows where getInitialURL()
// returns null when the app is launched via protocol activation.
// See: https://github.com/microsoft/react-native-windows/issues/6996
//
// Also provides IPC file polling for single-instance URL passing.
// =============================================================================
REACT_MODULE(DeepLinkModule)
struct DeepLinkModule {
  REACT_INIT(Initialize)
  void Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
    m_reactContext = reactContext;
  }

  // Get the initial URL that launched the app via protocol activation
  REACT_METHOD(getInitialURL)
  void getInitialURL(winrt::Microsoft::ReactNative::ReactPromise<winrt::hstring> promise) noexcept {
    if (!g_initialUrl.empty()) {
      promise.Resolve(winrt::hstring(g_initialUrl));
    } else {
      promise.Resolve(winrt::hstring(L""));
    }
  }

  // Clear the initial URL after it's been consumed
  REACT_METHOD(clearInitialURL)
  void clearInitialURL() noexcept {
    g_initialUrl.clear();
  }

  // Check for URL from IPC file (for single-instance URL passing)
  // Call this periodically from JS to check if another instance passed a URL
  REACT_METHOD(checkForCallbackUrl)
  void checkForCallbackUrl(winrt::Microsoft::ReactNative::ReactPromise<winrt::hstring> promise) noexcept {
    std::wstring url = ReadUrlFromIpcFile();
    if (!url.empty()) {
      OutputDebugStringW(L"[DeepLinkModule] Found callback URL from IPC: ");
      OutputDebugStringW(url.c_str());
      OutputDebugStringW(L"\n");
      promise.Resolve(winrt::hstring(url));
    } else {
      promise.Resolve(winrt::hstring(L""));
    }
  }

  // Bring the app window to the foreground
  // Call this after receiving OAuth callback to return focus to the app
  REACT_METHOD(bringToForeground)
  void bringToForeground() noexcept {
    OutputDebugStringW(L"[DeepLinkModule] bringToForeground called\n");

    if (g_mainWindowHandle != nullptr) {
      OutputDebugStringW(L"[DeepLinkModule] Bringing window to foreground...\n");

      // First, check if window is minimized and restore it
      if (IsIconic(g_mainWindowHandle)) {
        ShowWindow(g_mainWindowHandle, SW_RESTORE);
      }

      // Bring window to foreground
      // SetForegroundWindow has restrictions - the calling process must be in foreground
      // or the window must have been activated recently. We use a workaround:

      // Get the current foreground window's thread
      DWORD foregroundThreadId = GetWindowThreadProcessId(GetForegroundWindow(), NULL);
      DWORD currentThreadId = GetCurrentThreadId();

      // Attach input threads to allow SetForegroundWindow to work
      if (foregroundThreadId != currentThreadId) {
        AttachThreadInput(foregroundThreadId, currentThreadId, TRUE);
      }

      // Now bring our window to foreground
      SetForegroundWindow(g_mainWindowHandle);
      BringWindowToTop(g_mainWindowHandle);

      // Flash the taskbar button to grab attention (in case SetForegroundWindow fails)
      FLASHWINFO fi = {};
      fi.cbSize = sizeof(FLASHWINFO);
      fi.hwnd = g_mainWindowHandle;
      fi.dwFlags = FLASHW_ALL | FLASHW_TIMERNOFG;
      fi.uCount = 3;
      fi.dwTimeout = 0;
      FlashWindowEx(&fi);

      // Detach input threads
      if (foregroundThreadId != currentThreadId) {
        AttachThreadInput(foregroundThreadId, currentThreadId, FALSE);
      }

      OutputDebugStringW(L"[DeepLinkModule] Window brought to foreground\n");
    } else {
      OutputDebugStringW(L"[DeepLinkModule] No window handle available\n");
    }
  }

 private:
  winrt::Microsoft::ReactNative::ReactContext m_reactContext;
};

// Helper to convert HRESULT to hex string (used for protocol activation debugging)
std::wstring HResultToHexString(HRESULT hr) {
  wchar_t buf[32];
  swprintf_s(buf, L"0x%08X", static_cast<unsigned int>(hr));
  return std::wstring(buf);
}

// A PackageProvider containing any turbo modules you define within this app project
struct CompReactPackageProvider
    : winrt::implements<CompReactPackageProvider, winrt::Microsoft::ReactNative::IReactPackageProvider> {
 public: // IReactPackageProvider
  void CreatePackage(winrt::Microsoft::ReactNative::IReactPackageBuilder const &packageBuilder) noexcept {
    AddAttributedModules(packageBuilder, true);
  }
};

// Helper function to extract protocol URL from activation args
std::wstring GetProtocolUrlFromActivation() {
  std::wstring protocolUrl;

  try {
    OutputDebugStringW(L"[Protocol] Checking for protocol activation...\n");

    // Try to get activation args using AppLifecycle API (Windows App SDK / packaged apps)
    auto appInstance = winrt::Microsoft::Windows::AppLifecycle::AppInstance::GetCurrent();
    if (!appInstance) {
      OutputDebugStringW(L"[Protocol] No AppInstance available\n");
      return protocolUrl;
    }

    auto args = appInstance.GetActivatedEventArgs();
    if (!args) {
      OutputDebugStringW(L"[Protocol] No activation args available\n");
      return protocolUrl;
    }

    auto kind = args.Kind();
    OutputDebugStringW(L"[Protocol] Got activation args, kind: ");
    OutputDebugStringW(std::to_wstring(static_cast<int>(kind)).c_str());
    OutputDebugStringW(L"\n");

    // Only process if this is a Protocol activation (kind == 4)
    if (kind == winrt::Microsoft::Windows::AppLifecycle::ExtendedActivationKind::Protocol) {
      OutputDebugStringW(L"[Protocol] This is a Protocol activation, extracting URL...\n");

      auto data = args.Data();
      if (!data) {
        OutputDebugStringW(L"[Protocol] No Data in activation args\n");
        return protocolUrl;
      }

      auto protocolArgs = data.try_as<winrt::Windows::ApplicationModel::Activation::IProtocolActivatedEventArgs>();
      if (protocolArgs) {
        auto uri = protocolArgs.Uri();
        if (uri) {
          protocolUrl = std::wstring(uri.AbsoluteUri());
          OutputDebugStringW(L"[Protocol] URL from AppLifecycle activation: ");
          OutputDebugStringW(protocolUrl.c_str());
          OutputDebugStringW(L"\n");
        } else {
          OutputDebugStringW(L"[Protocol] Uri is null\n");
        }
      } else {
        OutputDebugStringW(L"[Protocol] Could not cast to IProtocolActivatedEventArgs\n");
      }
    } else {
      OutputDebugStringW(L"[Protocol] Not a Protocol activation (kind=");
      OutputDebugStringW(std::to_wstring(static_cast<int>(kind)).c_str());
      OutputDebugStringW(L"), skipping URL extraction\n");
    }
  } catch (winrt::hresult_error const& ex) {
    OutputDebugStringW(L"[Protocol] WinRT exception: ");
    OutputDebugStringW(ex.message().c_str());
    OutputDebugStringW(L" (HRESULT: ");
    OutputDebugStringW(HResultToHexString(ex.code()).c_str());
    OutputDebugStringW(L")\n");
  } catch (std::exception const& ex) {
    OutputDebugStringW(L"[Protocol] std::exception: ");
    OutputDebugStringA(ex.what());
    OutputDebugStringW(L"\n");
  } catch (...) {
    OutputDebugStringW(L"[Protocol] Unknown exception\n");
  }

  OutputDebugStringW(L"[Protocol] GetProtocolUrlFromActivation completed\n");
  return protocolUrl;
}

// The entry point of the Win32 application
_Use_decl_annotations_ int CALLBACK WinMain(HINSTANCE instance, HINSTANCE, PSTR commandLine, int showCmd) {
  // FIRST THING: Log that we're starting
  OutputDebugStringW(L"[Main] >>>>>> WinMain ENTRY <<<<<<\n");

  // Initialize WinRT
  OutputDebugStringW(L"[Main] Initializing WinRT apartment...\n");
  winrt::init_apartment(winrt::apartment_type::single_threaded);
  OutputDebugStringW(L"[Main] WinRT apartment initialized\n");

  // Enable per monitor DPI scaling
  SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

  OutputDebugStringW(L"[Main] ========== APP STARTING ==========\n");

  // Check for protocol activation URL
  // Method 1: Try AppLifecycle API (for packaged apps with protocol activation)
  OutputDebugStringW(L"[Main] About to call GetProtocolUrlFromActivation...\n");
  std::wstring protocolUrl = GetProtocolUrlFromActivation();
  OutputDebugStringW(L"[Main] GetProtocolUrlFromActivation returned\n");

  // Method 2: Fall back to command line check (for unpackaged or direct launch)
  if (protocolUrl.empty() && commandLine && strlen(commandLine) > 0) {
    std::string cmdLine(commandLine);
    OutputDebugStringA("[Protocol] Command line: ");
    OutputDebugStringA(cmdLine.c_str());
    OutputDebugStringA("\n");

    // Check if it's a protocol URL (starts with com.tamshai.ai://)
    if (cmdLine.find("com.tamshai.ai://") != std::string::npos) {
      // Convert to wide string for storage
      int size_needed = MultiByteToWideChar(CP_UTF8, 0, cmdLine.c_str(), (int)cmdLine.size(), NULL, 0);
      protocolUrl.resize(size_needed);
      MultiByteToWideChar(CP_UTF8, 0, cmdLine.c_str(), (int)cmdLine.size(), &protocolUrl[0], size_needed);
      OutputDebugStringW(L"[Protocol] URL from command line: ");
      OutputDebugStringW(protocolUrl.c_str());
      OutputDebugStringW(L"\n");
    }
  }

  // Single-instance check using mutex
  OutputDebugStringW(L"[SingleInstance] Creating mutex for single-instance check...\n");
  HANDLE hMutex = CreateMutexW(NULL, TRUE, SINGLE_INSTANCE_MUTEX_NAME);
  DWORD lastError = GetLastError();
  bool isFirstInstance = (lastError != ERROR_ALREADY_EXISTS);

  OutputDebugStringW(L"[SingleInstance] Mutex result - isFirstInstance: ");
  OutputDebugStringW(isFirstInstance ? L"YES" : L"NO");
  OutputDebugStringW(L", lastError: ");
  OutputDebugStringW(std::to_wstring(lastError).c_str());
  OutputDebugStringW(L", protocolUrl empty: ");
  OutputDebugStringW(protocolUrl.empty() ? L"YES" : L"NO");
  OutputDebugStringW(L"\n");

  if (!isFirstInstance && !protocolUrl.empty()) {
    // Another instance is already running - pass the URL via IPC file and exit
    OutputDebugStringW(L"[SingleInstance] >>>>>> SECOND INSTANCE DETECTED <<<<<<\n");
    OutputDebugStringW(L"[SingleInstance] Writing URL to IPC file and exiting...\n");
    WriteUrlToIpcFile(protocolUrl);
    CloseHandle(hMutex);
    OutputDebugStringW(L"[SingleInstance] Exiting second instance now.\n");
    return 0;  // Exit this instance
  }

  if (isFirstInstance) {
    OutputDebugStringW(L"[SingleInstance] This is the FIRST instance - continuing startup\n");
    // Clear any stale IPC file from previous failed attempts
    // This prevents processing old callbacks before user initiates login
    ClearStaleIpcFile();
  } else {
    OutputDebugStringW(L"[SingleInstance] Not first instance but no protocol URL - continuing anyway\n");
  }

  // If we have a protocol URL on first launch, store it
  if (!protocolUrl.empty()) {
    OutputDebugStringW(L"[SingleInstance] Storing protocol URL in g_initialUrl for JS to retrieve\n");
    g_initialUrl = protocolUrl;
  }

  // Find the path hosting the app exe file
  WCHAR appDirectory[MAX_PATH];
  GetModuleFileNameW(NULL, appDirectory, MAX_PATH);
  PathCchRemoveFileSpec(appDirectory, MAX_PATH);

  // Create a ReactNativeWin32App with the ReactNativeAppBuilder
  auto reactNativeWin32App{winrt::Microsoft::ReactNative::ReactNativeAppBuilder().Build()};

  // Configure the initial InstanceSettings for the app's ReactNativeHost
  auto settings{reactNativeWin32App.ReactNativeHost().InstanceSettings()};
  // Register any autolinked native modules
  RegisterAutolinkedNativeModulePackages(settings.PackageProviders());
  // Register any native modules defined within this app project
  settings.PackageProviders().Append(winrt::make<CompReactPackageProvider>());

#if BUNDLE
  // Load the JS bundle from a file (not Metro):
  // Set the path (on disk) where the .bundle file is located
  settings.BundleRootPath(std::wstring(L"file://").append(appDirectory).append(L"\\Bundle\\").c_str());
  // Set the name of the bundle file (without the .bundle extension)
  settings.JavaScriptBundleFile(L"index.windows");
  // Disable hot reload
  settings.UseFastRefresh(false);
#else
  // Load the JS bundle from Metro
  settings.JavaScriptBundleFile(L"index");
  // Enable hot reload
  settings.UseFastRefresh(true);
#endif
#if _DEBUG
  // For Debug builds
  // Enable Direct Debugging of JS
  settings.UseDirectDebugger(true);
  // Enable the Developer Menu
  settings.UseDeveloperSupport(true);
#else
  // For Release builds:
  // Disable Direct Debugging of JS
  settings.UseDirectDebugger(false);
  // Disable the Developer Menu
  settings.UseDeveloperSupport(false);
#endif

  // Get the AppWindow so we can configure its initial title and size
  auto appWindow{reactNativeWin32App.AppWindow()};
  appWindow.Title(L"TamshaiAI");
  appWindow.Resize({1000, 1000});

  // Get the HWND from the AppWindow for use in bringToForeground
  // AppWindow.Id() returns an AppWindowId which contains the window handle
  auto windowId = appWindow.Id();
  g_mainWindowHandle = winrt::Microsoft::UI::GetWindowFromWindowId(windowId);
  OutputDebugStringW(L"[Main] Captured main window handle for foreground operations\n");

  // Get the ReactViewOptions so we can set the initial RN component to load
  auto viewOptions{reactNativeWin32App.ReactViewOptions()};
  viewOptions.ComponentName(L"TamshaiAI");

  // Start the app
  reactNativeWin32App.Start();
}
