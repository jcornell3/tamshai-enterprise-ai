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
#include <winrt/Windows.ApplicationModel.Activation.h>
#include <winrt/Microsoft.Windows.AppLifecycle.h>
#include <string>
#include <fstream>
#include <atomic>
#include <mutex>
#include <condition_variable>
#include <objbase.h>  // For CoGetApartmentType

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
//
// IMPORTANT: WebAuthenticationBroker requires specific callback URI formats:
// - For packaged apps: use GetCurrentApplicationCallbackUri() which returns ms-app://...
// - Custom schemes like com.tamshai.ai:// are NOT supported
// =============================================================================
// Helper to convert HRESULT to hex string
std::wstring HResultToHexString(HRESULT hr) {
  wchar_t buf[32];
  swprintf_s(buf, L"0x%08X", static_cast<unsigned int>(hr));
  return std::wstring(buf);
}

// Helper to get HRESULT name
std::wstring GetHResultName(HRESULT hr) {
  switch (hr) {
    case 0x80010100: return L"RPC_E_SYS_CALL_FAILED - System call failed";
    case 0x8001010D: return L"RPC_E_WRONG_THREAD - Wrong thread";
    case 0x80004005: return L"E_FAIL - Unspecified failure";
    case 0x80070005: return L"E_ACCESSDENIED - Access denied";
    case 0x80004001: return L"E_NOTIMPL - Not implemented";
    case 0x80004002: return L"E_NOINTERFACE - No such interface";
    case 0x80004003: return L"E_POINTER - Invalid pointer";
    case 0x80004004: return L"E_ABORT - Operation aborted";
    case 0x8007000E: return L"E_OUTOFMEMORY - Out of memory";
    case 0x80070057: return L"E_INVALIDARG - Invalid argument";
    case 0x80000013: return L"CO_E_NOTINITIALIZED - COM not initialized";
    case 0x800401F0: return L"CO_E_NOT_SUPPORTED - Not supported";
    default: return L"Unknown HRESULT";
  }
}

// Store main thread ID for comparison
DWORD g_mainThreadId = 0;

// Global DispatcherQueue captured from main thread for WebAuthenticationBroker calls
winrt::Microsoft::UI::Dispatching::DispatcherQueue g_mainDispatcherQueue{nullptr};

REACT_MODULE(WebAuthModule)
struct WebAuthModule {
  REACT_INIT(Initialize)
  void Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
    m_reactContext = reactContext;

    DWORD initThreadId = GetCurrentThreadId();
    OutputDebugStringW(L"[WebAuthModule] ========== INITIALIZATION ==========\n");
    OutputDebugStringW(L"[WebAuthModule] Module initialized on thread ID: ");
    OutputDebugStringW(std::to_wstring(initThreadId).c_str());
    OutputDebugStringW(L"\n");
    OutputDebugStringW(L"[WebAuthModule] Main thread ID (from WinMain): ");
    OutputDebugStringW(std::to_wstring(g_mainThreadId).c_str());
    OutputDebugStringW(L"\n");
    OutputDebugStringW(L"[WebAuthModule] Same as main thread: ");
    OutputDebugStringW((initThreadId == g_mainThreadId) ? L"YES" : L"NO");
    OutputDebugStringW(L"\n");

    // Check COM apartment type
    APTTYPE aptType;
    APTTYPEQUALIFIER aptQualifier;
    HRESULT hr = CoGetApartmentType(&aptType, &aptQualifier);
    if (SUCCEEDED(hr)) {
      OutputDebugStringW(L"[WebAuthModule] COM Apartment Type: ");
      switch (aptType) {
        case APTTYPE_STA: OutputDebugStringW(L"STA (Single-Threaded)"); break;
        case APTTYPE_MTA: OutputDebugStringW(L"MTA (Multi-Threaded)"); break;
        case APTTYPE_NA: OutputDebugStringW(L"NA (Neutral)"); break;
        case APTTYPE_MAINSTA: OutputDebugStringW(L"MAINSTA (Main STA)"); break;
        default: OutputDebugStringW(L"Unknown"); break;
      }
      OutputDebugStringW(L"\n");
    } else {
      OutputDebugStringW(L"[WebAuthModule] COM Apartment Type: Failed to get - ");
      OutputDebugStringW(HResultToHexString(hr).c_str());
      OutputDebugStringW(L"\n");
    }
    OutputDebugStringW(L"[WebAuthModule] ====================================\n");
  }

  // Get the application callback URI for WebAuthenticationBroker
  // CRITICAL: Must dispatch to UI thread - WebAuthenticationBroker requires main STA thread
  REACT_METHOD(getCallbackUri)
  void getCallbackUri(winrt::Microsoft::ReactNative::ReactPromise<winrt::hstring> promise) noexcept {
    OutputDebugStringW(L"[WebAuthModule] ========== getCallbackUri CALLED ==========\n");
    OutputDebugStringW(L"[WebAuthModule] Caller thread ID: ");
    OutputDebugStringW(std::to_wstring(GetCurrentThreadId()).c_str());
    OutputDebugStringW(L"\n");
    OutputDebugStringW(L"[WebAuthModule] Main thread ID: ");
    OutputDebugStringW(std::to_wstring(g_mainThreadId).c_str());
    OutputDebugStringW(L"\n");

    // Check if we have the global dispatcher queue
    if (!g_mainDispatcherQueue) {
      OutputDebugStringW(L"[WebAuthModule] ERROR: g_mainDispatcherQueue is null! Trying ReactContext UIDispatcher...\n");

      // Try ReactContext's UIDispatcher as fallback
      auto uiDispatcher = m_reactContext.UIDispatcher();
      if (uiDispatcher) {
        OutputDebugStringW(L"[WebAuthModule] UIDispatcher is available, posting...\n");
        uiDispatcher.Post([promise]() {
          OutputDebugStringW(L"[WebAuthModule] getCallbackUri executing via UIDispatcher on thread: ");
          OutputDebugStringW(std::to_wstring(GetCurrentThreadId()).c_str());
          OutputDebugStringW(L"\n");

          try {
            auto callbackUri = winrt::Windows::Security::Authentication::Web::WebAuthenticationBroker::GetCurrentApplicationCallbackUri();
            OutputDebugStringW(L"[WebAuthModule] getCallbackUri SUCCESS: ");
            OutputDebugStringW(callbackUri.AbsoluteUri().c_str());
            OutputDebugStringW(L"\n");
            promise.Resolve(winrt::hstring(callbackUri.AbsoluteUri()));
          } catch (winrt::hresult_error const& ex) {
            OutputDebugStringW(L"[WebAuthModule] getCallbackUri FAILED: ");
            OutputDebugStringW(ex.message().c_str());
            OutputDebugStringW(L"\n");
            promise.Reject(winrt::to_string(ex.message()).c_str());
          } catch (...) {
            OutputDebugStringW(L"[WebAuthModule] getCallbackUri unknown exception\n");
            promise.Reject("Failed to get callback URI");
          }
        });
      } else {
        OutputDebugStringW(L"[WebAuthModule] ERROR: UIDispatcher is also null!\n");
        promise.Reject("No dispatcher available");
      }
      return;
    }

    OutputDebugStringW(L"[WebAuthModule] Using g_mainDispatcherQueue to dispatch...\n");

    // Dispatch to main thread using the global dispatcher queue
    bool enqueued = g_mainDispatcherQueue.TryEnqueue([promise]() {
      OutputDebugStringW(L"[WebAuthModule] getCallbackUri executing on main thread: ");
      OutputDebugStringW(std::to_wstring(GetCurrentThreadId()).c_str());
      OutputDebugStringW(L"\n");
      OutputDebugStringW(L"[WebAuthModule] Main thread ID expected: ");
      OutputDebugStringW(std::to_wstring(g_mainThreadId).c_str());
      OutputDebugStringW(L"\n");

      try {
        auto callbackUri = winrt::Windows::Security::Authentication::Web::WebAuthenticationBroker::GetCurrentApplicationCallbackUri();
        OutputDebugStringW(L"[WebAuthModule] getCallbackUri SUCCESS: ");
        OutputDebugStringW(callbackUri.AbsoluteUri().c_str());
        OutputDebugStringW(L"\n");
        promise.Resolve(winrt::hstring(callbackUri.AbsoluteUri()));
      } catch (winrt::hresult_error const& ex) {
        HRESULT hr = ex.code();
        OutputDebugStringW(L"[WebAuthModule] getCallbackUri FAILED!\n");
        OutputDebugStringW(L"[WebAuthModule]   Message: ");
        OutputDebugStringW(ex.message().c_str());
        OutputDebugStringW(L"\n");
        OutputDebugStringW(L"[WebAuthModule]   HRESULT: ");
        OutputDebugStringW(HResultToHexString(hr).c_str());
        OutputDebugStringW(L" - ");
        OutputDebugStringW(GetHResultName(hr).c_str());
        OutputDebugStringW(L"\n");
        promise.Reject(winrt::to_string(ex.message()).c_str());
      } catch (...) {
        OutputDebugStringW(L"[WebAuthModule] getCallbackUri unknown exception\n");
        promise.Reject("Failed to get callback URI");
      }
    });

    if (enqueued) {
      OutputDebugStringW(L"[WebAuthModule] Successfully enqueued to main dispatcher\n");
    } else {
      OutputDebugStringW(L"[WebAuthModule] ERROR: Failed to enqueue to main dispatcher!\n");
      promise.Reject("Failed to dispatch to main thread");
    }
  }

  // Authenticate using WebAuthenticationBroker (modal dialog)
  // CRITICAL: Must dispatch to UI thread - WebAuthenticationBroker requires main STA thread
  REACT_METHOD(authenticate)
  void authenticate(
      std::wstring authUrl,
      std::wstring callbackUrl,
      winrt::Microsoft::ReactNative::ReactPromise<winrt::hstring> promise) noexcept {

    DWORD callerThreadId = GetCurrentThreadId();

    OutputDebugStringW(L"[WebAuthModule] ========== AUTHENTICATE CALLED ==========\n");
    OutputDebugStringW(L"[WebAuthModule] Caller thread ID: ");
    OutputDebugStringW(std::to_wstring(callerThreadId).c_str());
    OutputDebugStringW(L"\n");
    OutputDebugStringW(L"[WebAuthModule] Main thread ID: ");
    OutputDebugStringW(std::to_wstring(g_mainThreadId).c_str());
    OutputDebugStringW(L"\n");

    // Check if we have the global dispatcher queue
    if (!g_mainDispatcherQueue) {
      OutputDebugStringW(L"[WebAuthModule] ERROR: g_mainDispatcherQueue is null for authenticate!\n");
      promise.Reject("No main thread dispatcher available");
      return;
    }

    OutputDebugStringW(L"[WebAuthModule] Dispatching to main thread via g_mainDispatcherQueue...\n");

    // Dispatch to main thread using the global dispatcher queue
    bool enqueued = g_mainDispatcherQueue.TryEnqueue([authUrl, callbackUrl, promise]() -> winrt::fire_and_forget {
      DWORD uiThreadId = GetCurrentThreadId();

      OutputDebugStringW(L"[WebAuthModule] Executing on UI thread ID: ");
      OutputDebugStringW(std::to_wstring(uiThreadId).c_str());
      OutputDebugStringW(L"\n");
      OutputDebugStringW(L"[WebAuthModule] Main thread ID: ");
      OutputDebugStringW(std::to_wstring(g_mainThreadId).c_str());
      OutputDebugStringW(L"\n");
      OutputDebugStringW(L"[WebAuthModule] Same as main thread: ");
      OutputDebugStringW((uiThreadId == g_mainThreadId) ? L"YES" : L"NO");
      OutputDebugStringW(L"\n");

      // Check COM apartment type
      APTTYPE aptType;
      APTTYPEQUALIFIER aptQualifier;
      HRESULT aptHr = CoGetApartmentType(&aptType, &aptQualifier);
      if (SUCCEEDED(aptHr)) {
        OutputDebugStringW(L"[WebAuthModule] COM Apartment: ");
        switch (aptType) {
          case APTTYPE_STA: OutputDebugStringW(L"STA"); break;
          case APTTYPE_MTA: OutputDebugStringW(L"MTA"); break;
          case APTTYPE_NA: OutputDebugStringW(L"NA"); break;
          case APTTYPE_MAINSTA: OutputDebugStringW(L"MAINSTA"); break;
          default: OutputDebugStringW(L"Unknown"); break;
        }
        OutputDebugStringW(L"\n");
      }

      OutputDebugStringW(L"[WebAuthModule] authUrl: ");
      OutputDebugStringW(authUrl.substr(0, 100).c_str());
      OutputDebugStringW(L"...\n");
      OutputDebugStringW(L"[WebAuthModule] callbackUrl: ");
      OutputDebugStringW(callbackUrl.c_str());
      OutputDebugStringW(L"\n");
      OutputDebugStringW(L"[WebAuthModule] =========================================\n");

      try {
        OutputDebugStringW(L"[WebAuthModule] Step 1: Creating startUri...\n");
        winrt::Windows::Foundation::Uri startUri(authUrl);
        OutputDebugStringW(L"[WebAuthModule] Step 1: SUCCESS - startUri created\n");

        OutputDebugStringW(L"[WebAuthModule] Step 2: Creating endUri...\n");
        winrt::Windows::Foundation::Uri endUri(callbackUrl);
        OutputDebugStringW(L"[WebAuthModule] Step 2: SUCCESS - endUri created\n");

        OutputDebugStringW(L"[WebAuthModule] Step 3: Calling AuthenticateAsync...\n");
        OutputDebugStringW(L"[WebAuthModule]   startUri.Host: ");
        OutputDebugStringW(startUri.Host().c_str());
        OutputDebugStringW(L"\n");
        OutputDebugStringW(L"[WebAuthModule]   startUri.Port: ");
        OutputDebugStringW(std::to_wstring(startUri.Port()).c_str());
        OutputDebugStringW(L"\n");
        OutputDebugStringW(L"[WebAuthModule]   endUri.SchemeName: ");
        OutputDebugStringW(endUri.SchemeName().c_str());
        OutputDebugStringW(L"\n");

        // Call AuthenticateAsync on UI thread
        auto result = co_await winrt::Windows::Security::Authentication::Web::WebAuthenticationBroker::AuthenticateAsync(
            winrt::Windows::Security::Authentication::Web::WebAuthenticationOptions::None,
            startUri,
            endUri);

        OutputDebugStringW(L"[WebAuthModule] Step 3: SUCCESS - AuthenticateAsync completed\n");

        auto status = result.ResponseStatus();
        OutputDebugStringW(L"[WebAuthModule] Response status: ");
        OutputDebugStringW(std::to_wstring(static_cast<int>(status)).c_str());
        switch (status) {
          case winrt::Windows::Security::Authentication::Web::WebAuthenticationStatus::Success:
            OutputDebugStringW(L" (Success)\n");
            break;
          case winrt::Windows::Security::Authentication::Web::WebAuthenticationStatus::UserCancel:
            OutputDebugStringW(L" (UserCancel)\n");
            break;
          case winrt::Windows::Security::Authentication::Web::WebAuthenticationStatus::ErrorHttp:
            OutputDebugStringW(L" (ErrorHttp)\n");
            break;
          default:
            OutputDebugStringW(L" (Unknown)\n");
            break;
        }

        switch (status) {
          case winrt::Windows::Security::Authentication::Web::WebAuthenticationStatus::Success: {
            auto responseData = result.ResponseData();
            OutputDebugStringW(L"[WebAuthModule] SUCCESS! ResponseData: ");
            OutputDebugStringW(responseData.c_str());
            OutputDebugStringW(L"\n");
            promise.Resolve(winrt::hstring(responseData));
            break;
          }
          case winrt::Windows::Security::Authentication::Web::WebAuthenticationStatus::UserCancel:
            OutputDebugStringW(L"[WebAuthModule] User cancelled authentication\n");
            promise.Reject("User cancelled authentication");
            break;
          case winrt::Windows::Security::Authentication::Web::WebAuthenticationStatus::ErrorHttp: {
            auto errorDetail = result.ResponseErrorDetail();
            OutputDebugStringW(L"[WebAuthModule] HTTP Error code: ");
            OutputDebugStringW(std::to_wstring(errorDetail).c_str());
            OutputDebugStringW(L"\n");
            std::string errorMsg = "HTTP error during authentication: " + std::to_string(errorDetail);
            promise.Reject(errorMsg.c_str());
            break;
          }
          default:
            OutputDebugStringW(L"[WebAuthModule] Unknown response status\n");
            promise.Reject("Unknown authentication response status");
            break;
        }
      } catch (winrt::hresult_error const& ex) {
        HRESULT hr = ex.code();
        OutputDebugStringW(L"[WebAuthModule] !!!!! EXCEPTION CAUGHT !!!!!\n");
        OutputDebugStringW(L"[WebAuthModule]   Message: ");
        OutputDebugStringW(ex.message().c_str());
        OutputDebugStringW(L"\n");
        OutputDebugStringW(L"[WebAuthModule]   HRESULT: ");
        OutputDebugStringW(HResultToHexString(hr).c_str());
        OutputDebugStringW(L"\n");
        OutputDebugStringW(L"[WebAuthModule]   HRESULT Name: ");
        OutputDebugStringW(GetHResultName(hr).c_str());
        OutputDebugStringW(L"\n");
        OutputDebugStringW(L"[WebAuthModule] !!!!!!!!!!!!!!!!!!!!!!!!!!\n");
        std::string errorMsg = "WebAuthenticationBroker error: " + winrt::to_string(ex.message());
        promise.Reject(errorMsg.c_str());
      } catch (std::exception const& ex) {
        OutputDebugStringW(L"[WebAuthModule] !!!!! STD::EXCEPTION !!!!!\n");
        OutputDebugStringA("[WebAuthModule]   what(): ");
        OutputDebugStringA(ex.what());
        OutputDebugStringA("\n");
        promise.Reject(ex.what());
      } catch (...) {
        OutputDebugStringW(L"[WebAuthModule] !!!!! UNKNOWN EXCEPTION !!!!!\n");
        promise.Reject("Unknown error during authentication");
      }

      co_return;
    });

    if (enqueued) {
      OutputDebugStringW(L"[WebAuthModule] Successfully enqueued authenticate to main dispatcher\n");
    } else {
      OutputDebugStringW(L"[WebAuthModule] ERROR: Failed to enqueue authenticate to main dispatcher!\n");
      promise.Reject("Failed to dispatch authenticate to main thread");
    }
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

  // Capture main thread ID for diagnostics
  g_mainThreadId = GetCurrentThreadId();
  OutputDebugStringW(L"[Main] ========== APP STARTING ==========\n");
  OutputDebugStringW(L"[Main] Main thread ID: ");
  OutputDebugStringW(std::to_wstring(g_mainThreadId).c_str());
  OutputDebugStringW(L"\n");

  // Check COM apartment type on main thread
  APTTYPE aptType;
  APTTYPEQUALIFIER aptQualifier;
  HRESULT aptHr = CoGetApartmentType(&aptType, &aptQualifier);
  if (SUCCEEDED(aptHr)) {
    OutputDebugStringW(L"[Main] COM Apartment Type: ");
    switch (aptType) {
      case APTTYPE_STA: OutputDebugStringW(L"STA"); break;
      case APTTYPE_MTA: OutputDebugStringW(L"MTA"); break;
      case APTTYPE_NA: OutputDebugStringW(L"NA"); break;
      case APTTYPE_MAINSTA: OutputDebugStringW(L"MAINSTA"); break;
      default: OutputDebugStringW(L"Unknown"); break;
    }
    OutputDebugStringW(L"\n");
  }
  OutputDebugStringW(L"[Main] =====================================\n");

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

  // Capture the DispatcherQueue for the main thread (for WebAuthenticationBroker)
  // This must be done after ReactNativeAppBuilder().Build() which sets up the dispatcher
  g_mainDispatcherQueue = winrt::Microsoft::UI::Dispatching::DispatcherQueue::GetForCurrentThread();
  if (g_mainDispatcherQueue) {
    OutputDebugStringW(L"[Main] Captured main thread DispatcherQueue successfully\n");
  } else {
    OutputDebugStringW(L"[Main] WARNING: Failed to capture main thread DispatcherQueue!\n");
  }

  // TEST: Try calling GetCurrentApplicationCallbackUri on main thread directly
  // This verifies WebAuthenticationBroker works on the main thread before any dispatch
  OutputDebugStringW(L"[Main] Testing WebAuthenticationBroker on main thread...\n");
  try {
    auto testCallbackUri = winrt::Windows::Security::Authentication::Web::WebAuthenticationBroker::GetCurrentApplicationCallbackUri();
    OutputDebugStringW(L"[Main] TEST SUCCESS! Callback URI: ");
    OutputDebugStringW(testCallbackUri.AbsoluteUri().c_str());
    OutputDebugStringW(L"\n");
  } catch (winrt::hresult_error const& ex) {
    OutputDebugStringW(L"[Main] TEST FAILED on main thread! Error: ");
    OutputDebugStringW(ex.message().c_str());
    OutputDebugStringW(L" HRESULT: ");
    OutputDebugStringW(HResultToHexString(ex.code()).c_str());
    OutputDebugStringW(L"\n");
  } catch (...) {
    OutputDebugStringW(L"[Main] TEST FAILED with unknown exception\n");
  }

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
