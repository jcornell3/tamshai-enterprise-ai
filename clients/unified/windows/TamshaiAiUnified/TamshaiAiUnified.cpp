// TamshaiAiUnified.cpp : Defines the entry point for the application.
//

#include "pch.h"
#include "TamshaiAiUnified.h"

#include "AutolinkedNativeModules.g.h"

#include "NativeModules.h"
#include <winrt/Microsoft.ReactNative.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Security.Authentication.Web.h>
#include <winrt/Windows.System.h>
#include <winrt/Microsoft.UI.Dispatching.h>
#include <string>
#include <fstream>
#include <atomic>

// Global to store the initial URL from protocol activation
std::wstring g_initialUrl;

// Global for IPC file polling (checked by JS via native module)
std::atomic<bool> g_hasNewUrl{false};
std::wstring g_pendingUrl;

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
    std::wofstream file(ipcPath, std::ios::trunc);
    if (file.is_open()) {
        file << url;
        file.close();
        OutputDebugStringW(L"[IPC] Wrote URL to IPC file: ");
        OutputDebugStringW(url.c_str());
        OutputDebugStringW(L"\n");
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
    }
    return url;
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

 private:
  winrt::Microsoft::ReactNative::ReactContext m_reactContext;
};

// =============================================================================
// WebAuthModule - Native module for WebAuthenticationBroker-based OAuth
// Uses Windows WebAuthenticationBroker to show auth in a modal dialog
// instead of opening the system browser.
//
// CRITICAL: WebAuthenticationBroker.AuthenticateAsync MUST run on UI thread!
// Running on RN thread will silently fail with UserCancel status.
// =============================================================================
REACT_MODULE(WebAuthModule)
struct WebAuthModule {
  REACT_INIT(Initialize)
  void Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
    m_reactContext = reactContext;
  }

  // Authenticate using WebAuthenticationBroker (modal dialog)
  // Returns the full callback URL with auth code on success
  REACT_METHOD(authenticate)
  winrt::fire_and_forget authenticate(
      std::wstring authUrl,
      std::wstring callbackUrl,
      winrt::Microsoft::ReactNative::ReactPromise<winrt::hstring> promise) noexcept {

    auto capturedPromise = promise;
    auto context = m_reactContext;
    auto capturedAuthUrl = authUrl;
    auto capturedCallbackUrl = callbackUrl;

    OutputDebugStringW(L"[WebAuthModule] authenticate called\n");
    OutputDebugStringW(L"[WebAuthModule] authUrl: ");
    OutputDebugStringW(capturedAuthUrl.c_str());
    OutputDebugStringW(L"\n");
    OutputDebugStringW(L"[WebAuthModule] callbackUrl: ");
    OutputDebugStringW(capturedCallbackUrl.c_str());
    OutputDebugStringW(L"\n");

    // Schedule work on UI thread using ReactContext's dispatcher
    context.UIDispatcher().Post([capturedPromise, capturedAuthUrl, capturedCallbackUrl]() mutable {
      OutputDebugStringW(L"[WebAuthModule] Running on UI thread, calling AuthenticateAsync\n");

      try {
        winrt::Windows::Foundation::Uri startUri(capturedAuthUrl);
        winrt::Windows::Foundation::Uri endUri(capturedCallbackUrl);

        OutputDebugStringW(L"[WebAuthModule] URIs created, starting AuthenticateAsync\n");

        // Start the async operation
        auto asyncOp = winrt::Windows::Security::Authentication::Web::WebAuthenticationBroker::AuthenticateAsync(
            winrt::Windows::Security::Authentication::Web::WebAuthenticationOptions::None,
            startUri,
            endUri);

        OutputDebugStringW(L"[WebAuthModule] AuthenticateAsync started, setting up completion handler\n");

        // Handle completion
        asyncOp.Completed([capturedPromise](auto const& asyncInfo, auto const& asyncStatus) mutable {
          try {
            if (asyncStatus == winrt::Windows::Foundation::AsyncStatus::Completed) {
              auto result = asyncInfo.GetResults();
              auto status = result.ResponseStatus();

              OutputDebugStringW(L"[WebAuthModule] AuthenticateAsync completed with status: ");
              OutputDebugStringW(std::to_wstring(static_cast<int>(status)).c_str());
              OutputDebugStringW(L"\n");

              switch (status) {
                case winrt::Windows::Security::Authentication::Web::WebAuthenticationStatus::Success: {
                  auto responseData = result.ResponseData();
                  OutputDebugStringW(L"[WebAuthModule] Success! Response: ");
                  OutputDebugStringW(responseData.c_str());
                  OutputDebugStringW(L"\n");
                  capturedPromise.Resolve(winrt::hstring(responseData));
                  break;
                }
                case winrt::Windows::Security::Authentication::Web::WebAuthenticationStatus::UserCancel:
                  OutputDebugStringW(L"[WebAuthModule] User cancelled\n");
                  capturedPromise.Reject("User cancelled authentication");
                  break;
                case winrt::Windows::Security::Authentication::Web::WebAuthenticationStatus::ErrorHttp: {
                  auto errorDetail = result.ResponseErrorDetail();
                  OutputDebugStringW(L"[WebAuthModule] HTTP error: ");
                  OutputDebugStringW(std::to_wstring(errorDetail).c_str());
                  OutputDebugStringW(L"\n");
                  capturedPromise.Reject("HTTP error during authentication");
                  break;
                }
                default:
                  OutputDebugStringW(L"[WebAuthModule] Unknown error\n");
                  capturedPromise.Reject("Unknown authentication error");
                  break;
              }
            } else if (asyncStatus == winrt::Windows::Foundation::AsyncStatus::Canceled) {
              OutputDebugStringW(L"[WebAuthModule] Async operation was cancelled\n");
              capturedPromise.Reject("Authentication was cancelled");
            } else if (asyncStatus == winrt::Windows::Foundation::AsyncStatus::Error) {
              OutputDebugStringW(L"[WebAuthModule] Async operation error\n");
              try {
                asyncInfo.GetResults(); // This will throw with the actual error
              } catch (winrt::hresult_error const& asyncEx) {
                OutputDebugStringW(L"[WebAuthModule] Async error details: ");
                OutputDebugStringW(asyncEx.message().c_str());
                OutputDebugStringW(L"\n");
                capturedPromise.Reject(winrt::to_string(asyncEx.message()).c_str());
                return;
              }
              capturedPromise.Reject("Authentication failed with error");
            } else {
              OutputDebugStringW(L"[WebAuthModule] Unknown async status\n");
              capturedPromise.Reject("Authentication failed");
            }
          } catch (winrt::hresult_error const& completionEx) {
            OutputDebugStringW(L"[WebAuthModule] Completion handler exception: ");
            OutputDebugStringW(completionEx.message().c_str());
            OutputDebugStringW(L"\n");
            capturedPromise.Reject(winrt::to_string(completionEx.message()).c_str());
          } catch (...) {
            OutputDebugStringW(L"[WebAuthModule] Unknown completion handler exception\n");
            capturedPromise.Reject("Unknown error in authentication completion");
          }
        });
      } catch (winrt::hresult_error const& ex) {
        OutputDebugStringW(L"[WebAuthModule] Exception starting auth: ");
        OutputDebugStringW(ex.message().c_str());
        OutputDebugStringW(L"\n");
        capturedPromise.Reject(winrt::to_string(ex.message()).c_str());
      } catch (...) {
        OutputDebugStringW(L"[WebAuthModule] Unknown exception starting auth\n");
        capturedPromise.Reject("Unknown error starting authentication");
      }
    });

    co_return;
  }

 private:
  winrt::Microsoft::ReactNative::ReactContext m_reactContext;
};

// A PackageProvider containing any turbo modules you define within this app project
struct CompReactPackageProvider
    : winrt::implements<CompReactPackageProvider, winrt::Microsoft::ReactNative::IReactPackageProvider> {
 public: // IReactPackageProvider
  void CreatePackage(winrt::Microsoft::ReactNative::IReactPackageBuilder const &packageBuilder) noexcept {
    AddAttributedModules(packageBuilder, true);
  }
};

// The entry point of the Win32 application
_Use_decl_annotations_ int CALLBACK WinMain(HINSTANCE instance, HINSTANCE, PSTR commandLine, int showCmd) {
  // Initialize WinRT
  winrt::init_apartment(winrt::apartment_type::single_threaded);

  // Enable per monitor DPI scaling
  SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

  // Check for protocol activation URL in command line
  // When launched via protocol (com.tamshai.ai://...), the URL is passed as command line arg
  std::wstring protocolUrl;
  if (commandLine && strlen(commandLine) > 0) {
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
  HANDLE hMutex = CreateMutexW(NULL, TRUE, SINGLE_INSTANCE_MUTEX_NAME);
  bool isFirstInstance = (GetLastError() != ERROR_ALREADY_EXISTS);

  if (!isFirstInstance && !protocolUrl.empty()) {
    // Another instance is already running - pass the URL via IPC file and exit
    OutputDebugStringW(L"[SingleInstance] Another instance running. Passing URL via IPC file.\n");
    WriteUrlToIpcFile(protocolUrl);
    CloseHandle(hMutex);
    return 0;  // Exit this instance
  }

  // If we have a protocol URL on first launch, store it
  if (!protocolUrl.empty()) {
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

  // Get the ReactViewOptions so we can set the initial RN component to load
  auto viewOptions{reactNativeWin32App.ReactViewOptions()};
  viewOptions.ComponentName(L"TamshaiAI");

  // Start the app
  reactNativeWin32App.Start();
}
