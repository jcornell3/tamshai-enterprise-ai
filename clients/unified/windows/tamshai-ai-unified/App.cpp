#include "pch.h"

#include "App.h"

#include "AutolinkedNativeModules.g.h"
#include "ReactPackageProvider.h"
#include <fstream>

using namespace winrt;
using namespace xaml;
using namespace xaml::Controls;
using namespace xaml::Navigation;

using namespace Windows::ApplicationModel;

// Global to store the initial URL from protocol activation (used by DeepLinkModule)
std::wstring g_initialUrl;

// IPC file path for single-instance URL passing
std::wstring GetAppIpcFilePath() {
    wchar_t tempPath[MAX_PATH];
    GetTempPathW(MAX_PATH, tempPath);
    return std::wstring(tempPath) + L"tamshai_ai_callback_url.txt";
}

// Write URL to IPC file for running instance to pick up
void WriteUrlToIpcFile(const std::wstring& url) {
    std::wstring ipcPath = GetAppIpcFilePath();
    OutputDebugStringW(L"[IPC] Writing URL to IPC file: ");
    OutputDebugStringW(url.c_str());
    OutputDebugStringW(L"\n");

    std::wofstream file(ipcPath, std::ios::trunc);
    if (file.is_open()) {
        file << url;
        file.close();
        OutputDebugStringW(L"[IPC] SUCCESS - Wrote URL to IPC file\n");
    } else {
        OutputDebugStringW(L"[IPC] ERROR - Failed to open IPC file for writing\n");
    }
}

// Clear stale IPC file on startup
void ClearStaleIpcFile() {
    std::wstring ipcPath = GetAppIpcFilePath();
    if (DeleteFileW(ipcPath.c_str())) {
        OutputDebugStringW(L"[IPC] Cleared stale IPC file on startup\n");
    }
}

namespace winrt::tamshai_ai_unified::implementation
{
/// <summary>
/// Initializes the singleton application object.  This is the first line of
/// authored code executed, and as such is the logical equivalent of main() or
/// WinMain().
/// </summary>
App::App() noexcept
{
#if BUNDLE
    JavaScriptBundleFile(L"index.windows");
    InstanceSettings().UseWebDebugger(false);
    InstanceSettings().UseFastRefresh(false);
#else
    JavaScriptBundleFile(L"index");
    InstanceSettings().UseWebDebugger(true);
    InstanceSettings().UseFastRefresh(true);
#endif

#if _DEBUG
    InstanceSettings().UseDeveloperSupport(true);
#else
    InstanceSettings().UseDeveloperSupport(false);
#endif

    RegisterAutolinkedNativeModulePackages(PackageProviders()); // Includes any autolinked modules

    PackageProviders().Append(make<ReactPackageProvider>()); // Includes all modules in this project

    InitializeComponent();
}

/// <summary>
/// Invoked when the application is launched normally by the end user.  Other entry points
/// will be used such as when the application is launched to open a specific file.
/// </summary>
/// <param name="e">Details about the launch request and process.</param>
void App::OnLaunched(activation::LaunchActivatedEventArgs const& e)
{
    super::OnLaunched(e);

    Frame rootFrame = Window::Current().Content().as<Frame>();
    rootFrame.Navigate(xaml_typename<MainPage>(), box_value(e.Arguments()));
}

/// <summary>
/// Invoked when the application is activated by some means other than normal launching.
/// This handles protocol activation (com.tamshai.ai://) for OAuth callbacks.
/// </summary>
void App::OnActivated(Activation::IActivatedEventArgs const &e) {
  OutputDebugStringW(L"[App] OnActivated called\n");

  // Check if this is a protocol activation
  if (e.Kind() == Activation::ActivationKind::Protocol) {
    OutputDebugStringW(L"[App] Protocol activation detected\n");
    auto protocolArgs = e.as<Activation::ProtocolActivatedEventArgs>();
    if (protocolArgs) {
      auto uri = protocolArgs.Uri();
      if (uri) {
        std::wstring url = std::wstring(uri.AbsoluteUri());
        OutputDebugStringW(L"[App] Protocol URL: ");
        OutputDebugStringW(url.c_str());
        OutputDebugStringW(L"\n");

        // Check if app is already running (has content)
        auto preActivationContent = Window::Current().Content();
        if (preActivationContent) {
          // App is already running - write URL to IPC file for JS to poll
          OutputDebugStringW(L"[App] App already running - writing to IPC file\n");
          WriteUrlToIpcFile(url);
        } else {
          // App is starting fresh - store URL globally for DeepLinkModule
          OutputDebugStringW(L"[App] App starting fresh - storing in g_initialUrl\n");
          g_initialUrl = url;
        }
      }
    }
  }

  auto preActivationContent = Window::Current().Content();
  super::OnActivated(e);
  if (!preActivationContent && Window::Current()) {
    Frame rootFrame = Window::Current().Content().as<Frame>();
    rootFrame.Navigate(xaml_typename<MainPage>(), nullptr);
  }
}

/// <summary>
/// Invoked when application execution is being suspended.  Application state is saved
/// without knowing whether the application will be terminated or resumed with the contents
/// of memory still intact.
/// </summary>
/// <param name="sender">The source of the suspend request.</param>
/// <param name="e">Details about the suspend request.</param>
void App::OnSuspending([[maybe_unused]] IInspectable const& sender, [[maybe_unused]] SuspendingEventArgs const& e)
{
    // Save application state and stop any background activity
}

/// <summary>
/// Invoked when Navigation to a certain page fails
/// </summary>
/// <param name="sender">The Frame which failed navigation</param>
/// <param name="e">Details about the navigation failure</param>
void App::OnNavigationFailed(IInspectable const&, NavigationFailedEventArgs const& e)
{
    throw hresult_error(E_FAIL, hstring(L"Failed to load Page ") + e.SourcePageType().Name);
}

} // namespace winrt::tamshai_ai_unified::implementation
