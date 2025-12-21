#include "pch.h"
#include "ReactPackageProvider.h"
#include "NativeModules.h"
#include <fstream>
#include <atomic>

using namespace winrt::Microsoft::ReactNative;

// Global to store the initial URL from protocol activation
extern std::wstring g_initialUrl;

// IPC file path for single-instance URL passing
std::wstring GetIpcFilePath() {
    wchar_t tempPath[MAX_PATH];
    GetTempPathW(MAX_PATH, tempPath);
    return std::wstring(tempPath) + L"tamshai_ai_callback_url.txt";
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

// =============================================================================
// DeepLinkModule - Native module to expose protocol activation URL to JS
// =============================================================================
REACT_MODULE(DeepLinkModule)
struct DeepLinkModule {
    REACT_INIT(Initialize)
    void Initialize(winrt::Microsoft::ReactNative::ReactContext const& reactContext) noexcept {
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

    // Debug log from JavaScript
    REACT_METHOD(debugLog)
    void debugLog(std::wstring message) noexcept {
        OutputDebugStringW(L"[JS] ");
        OutputDebugStringW(message.c_str());
        OutputDebugStringW(L"\n");
    }

    // Bring the app window to the foreground (UWP version)
    REACT_METHOD(bringToForeground)
    void bringToForeground() noexcept {
        OutputDebugStringW(L"[DeepLinkModule] bringToForeground called (UWP)\n");
        // In UWP, focus is managed by the system - we can try to activate the window
        try {
            auto window = winrt::Windows::UI::Xaml::Window::Current();
            if (window) {
                window.Activate();
                OutputDebugStringW(L"[DeepLinkModule] Window activated\n");
            }
        } catch (...) {
            OutputDebugStringW(L"[DeepLinkModule] Failed to activate window\n");
        }
    }

private:
    winrt::Microsoft::ReactNative::ReactContext m_reactContext;
};

namespace winrt::tamshai_ai_unified::implementation
{

void ReactPackageProvider::CreatePackage(IReactPackageBuilder const &packageBuilder) noexcept
{
    AddAttributedModules(packageBuilder, true);
}

} // namespace winrt::tamshai_ai_unified::implementation
