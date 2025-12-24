#include "pch.h"
#include "MainPage.h"
#if __has_include("MainPage.g.cpp")
#include "MainPage.g.cpp"
#endif

#include "App.h"

using namespace winrt;
using namespace xaml;

namespace winrt::TamshaiAiUnified::implementation
{
    MainPage::MainPage()
    {
        InitializeComponent();
        // TEMP DISABLED: Isolating crash
        // auto app = Application::Current().as<App>();
        // ReactRootView().ReactNativeHost(app->Host());
    }
}
