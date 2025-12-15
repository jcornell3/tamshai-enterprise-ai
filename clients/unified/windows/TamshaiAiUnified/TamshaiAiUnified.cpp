// TamshaiAiUnified.cpp : Defines the entry point for the application.
//

#include "pch.h"
#include "TamshaiAiUnified.h"

#include "AutolinkedNativeModules.g.h"

#include "NativeModules.h"
#include <winrt/Microsoft.ReactNative.h>
#include <string>

// Global to store the initial URL from protocol activation
std::wstring g_initialUrl;

// =============================================================================
// DeepLinkModule - Native module to expose protocol activation URL to JS
// This works around a known issue in React Native Windows where getInitialURL()
// returns null when the app is launched via protocol activation.
// See: https://github.com/microsoft/react-native-windows/issues/6996
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
  if (commandLine && strlen(commandLine) > 0) {
    std::string cmdLine(commandLine);
    // Check if it's a protocol URL (starts with com.tamshai.ai://)
    if (cmdLine.find("com.tamshai.ai://") != std::string::npos) {
      // Convert to wide string for storage
      int size_needed = MultiByteToWideChar(CP_UTF8, 0, cmdLine.c_str(), (int)cmdLine.size(), NULL, 0);
      g_initialUrl.resize(size_needed);
      MultiByteToWideChar(CP_UTF8, 0, cmdLine.c_str(), (int)cmdLine.size(), &g_initialUrl[0], size_needed);
      OutputDebugStringW(L"[Protocol] Initial URL from command line: ");
      OutputDebugStringW(g_initialUrl.c_str());
      OutputDebugStringW(L"\n");
    }
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
