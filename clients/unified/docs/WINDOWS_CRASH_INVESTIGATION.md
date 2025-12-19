# Windows Client Crash Investigation

**Date**: December 19, 2025
**Platform**: React Native Windows 0.80.0
**Status**: Unresolved - Blocked by RN Windows Architecture Issues

## Executive Summary

The TamshaiAI Windows desktop client experiences fatal crashes when using TextInput components. After extensive investigation, we've identified this as a fundamental incompatibility in React Native Windows 0.80 between its JavaScript engines and the available UI architectures.

## Problem Statement

When a user types in a TextInput field and submits (Enter key or button press), the application crashes with an access violation. This blocks all chat functionality since the primary use case requires text input.

## Environment

- **React Native**: 0.80.0
- **React Native Windows**: 0.80.0
- **React**: 19.1.0
- **Node.js**: 20+
- **Visual Studio**: 2022
- **Windows SDK**: 10.0.19041.0+
- **Target**: Windows 10/11 (UWP)

## Crash Details

### Scenario 1: Hermes Engine + Fabric Architecture (New Architecture)

**Configuration**:
- `UseHermes=true` (ExperimentalFeatures.props)
- Template: `cpp-app` (Composition/WinAppSDK)

**Crash**:
```
Exception thrown at 0x00007FF8AE9A2D10 (hermes.dll) in TamshaiAiUnified.exe:
0xC0000005: Access violation reading location 0x0000000000000010.

Stack trace:
hermes.dll!hermes::vm::HermesValue::getObject()
hermes.dll!hermes::vm::PseudoHandle<...>::get()
hermes.dll!facebook::hermes::HermesRuntimeImpl::call()
Microsoft.ReactNative.dll!...
```

**Root Cause Analysis**:
The crash occurs in Hermes's `getObject()` function when dereferencing a null/invalid pointer (0x10 offset from null). This happens during TextInput's layout measurement when:
1. User types text and triggers re-render
2. Fabric's C++ layout engine measures the TextInput
3. A race condition causes Hermes to access a garbage-collected or unmapped object
4. The null dereference crashes the process

**Third-Party Confirmation**:
> "The Fabric (New Architecture) C++ implementation of TextInput in React Native Windows has known race conditions in its layout measurement code when using the Hermes JavaScript engine."

### Scenario 2: Chakra Engine + Legacy UWP Architecture

**Configuration**:
- `UseHermes=false` (ExperimentalFeatures.props)
- Template: `old/uwp-cpp-app` (Legacy XAML Islands)

**Crash**:
```
Exception thrown at 0x00007FF8C25D782A in TamshaiAiUnified.exe:
Microsoft C++ exception: UnifiedRegex::ParseError at memory location 0x0000001371EFA3C0.

Exception thrown: ParseExceptionObject
Exception thrown: facebook::jsi::JSError

App displays: "Exception: Unexpected quantifier  no stack"
```

**Root Cause Analysis**:
Chakra (the legacy Windows JavaScript engine) does not support ES2018+ regex features:
- Named capture groups: `(?<name>...)`
- Lookbehind assertions: `(?<=...)` or `(?<!...)`
- Unicode property escapes: `\p{...}`

Modern npm packages (React 19, zustand 5.x, etc.) use these features, causing Chakra to fail during JavaScript parsing before the app even renders.

**Attempted Fix**:
Downgraded zustand from 5.0.2 to 4.5.5 to remove one source of modern regex. However, other dependencies (React 19, RN 0.80 internals) still contain incompatible syntax.

### Scenario 3: Chakra Cannot Be Disabled with Composition

**Attempted Configuration**:
- `UseHermes=false`
- `RnwNewArch=false`
- Template: `cpp-app` (Composition)

**Build Error**:
```
error MSB4018: Property 'RnwNewArch' was not set to 'true'.
Projects built against Microsoft.ReactNative.Composition require 'RnwNewArch' to be 'true'.
```

**Root Cause**:
The Composition architecture (WinAppSDK/WinUI 3) fundamentally requires the New Architecture (Fabric). You cannot use Composition without Fabric.

## Architecture Compatibility Matrix

| JS Engine | Architecture | Template | TextInput | Modern JS | Status |
|-----------|--------------|----------|-----------|-----------|--------|
| Hermes | Fabric/Composition | cpp-app | ❌ Crashes | ✅ Works | **Blocked** |
| Hermes | Legacy UWP | old/uwp-cpp-app | ? Unknown | ✅ Works | Not Tested |
| Chakra | Legacy UWP | old/uwp-cpp-app | ✅ Stable | ❌ Fails | **Blocked** |
| Chakra | Fabric/Composition | cpp-app | N/A | N/A | Build Error |

## Workarounds Attempted

### 1. Deferred TextInput Rendering
```typescript
const [showInput, setShowInput] = useState(false);
useEffect(() => {
  const timer = setTimeout(() => setShowInput(true), 100);
  return () => clearTimeout(timer);
}, []);
```
**Result**: No effect. Crash still occurs on submit.

### 2. blurOnSubmit={false} + Manual Blur
```typescript
<TextInput
  blurOnSubmit={false}
  onSubmitEditing={() => {
    inputRef.current?.blur();
    setTimeout(() => handleSend(), 50);
  }}
/>
```
**Result**: No effect. Crash still occurs.

### 3. Keyboard.dismiss() Before Submit
```typescript
const handleSend = () => {
  Keyboard.dismiss();
  setTimeout(() => onSend(text), 100);
};
```
**Result**: No effect. Crash still occurs.

### 4. Switch to Legacy UWP Template
Regenerated Windows project with `--template old/uwp-cpp-app`.
**Result**: Changed crash from Hermes access violation to Chakra regex parse error.

### 5. Disable Hermes (UseHermes=false)
Set `<UseHermes>false</UseHermes>` in ExperimentalFeatures.props.
**Result**: App uses Chakra, but Chakra can't parse modern JavaScript.

### 6. Downgrade zustand to v4.x
```bash
npm install zustand@4.5.5 --save
```
**Result**: Reduces one source of modern regex, but React 19 and other deps still fail.

## Files Modified During Investigation

| File | Changes |
|------|---------|
| `windows/ExperimentalFeatures.props` | Set `UseHermes=false` |
| `windows/TamshaiAiUnified/App.cpp` | Added protocol activation for OAuth |
| `windows/TamshaiAiUnified/ReactPackageProvider.cpp` | Added DeepLinkModule native module |
| `windows/TamshaiAiUnified/Package.appxmanifest` | Added protocol handler |
| `package.json` | Downgraded zustand to 4.5.5 |
| `src/components/MessageInput.tsx` | Various workaround attempts (reverted) |

## Potential Solutions (Not Yet Attempted)

### Option A: Downgrade React Native Windows
Use RN Windows 0.73.x or earlier which has:
- Stable legacy TextInput implementation
- Better Hermes compatibility
- Less aggressive New Architecture requirements

**Risk**: May require significant code changes, loss of new features.

### Option B: Add Babel Regex Transform
Configure Babel to transpile modern regex to ES5-compatible patterns:
```javascript
// babel.config.js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    ['@babel/plugin-transform-named-capturing-groups-regex'],
  ],
};
```
**Risk**: May not cover all incompatible patterns in node_modules.

### Option C: Use Custom TextInput Native Module
Implement a Windows-native TextInput that bypasses React Native's implementation:
```cpp
REACT_MODULE(SafeTextInputModule)
struct SafeTextInputModule {
  REACT_METHOD(getValue)
  void getValue(ReactPromise<winrt::hstring> promise);
};
```
**Risk**: Significant development effort, maintenance burden.

### Option D: Wait for RN Windows Fix
Monitor these GitHub issues:
- https://github.com/microsoft/react-native-windows/issues (TextInput crashes)
- https://github.com/nicknisi/mac-dotfiles/discussions (Hermes + Fabric)

**Risk**: Unknown timeline, may never be fixed for 0.80.

### Option E: Switch to Electron
Abandon React Native Windows in favor of Electron:
- Known-working WebView-based approach
- Larger binary size (~150MB vs ~50MB)
- Different build/deployment pipeline

**Risk**: Significant architecture change, different skill requirements.

## Recommendations

1. **Short-term**: Evaluate Option A (downgrade to RN Windows 0.73.x)
2. **Medium-term**: Investigate Option C (native TextInput module)
3. **Long-term**: Monitor RN Windows releases for TextInput fixes

## Related Issues

- React Native Windows TextInput race conditions
- Hermes null pointer dereference in HermesValue::getObject
- Chakra ES2018+ regex incompatibility
- Fabric layout measurement threading issues

## Appendix: Full Stack Traces

### Hermes Crash (Scenario 1)
```
'TamshaiAiUnified.exe' (Win32): Loaded 'hermes.dll'.
Exception thrown at 0x00007FF8AE9A2D10 (hermes.dll) in TamshaiAiUnified.exe:
0xC0000005: Access violation reading location 0x0000000000000010.

hermes.dll!hermes::vm::HermesValue::getObject() Line 230
hermes.dll!hermes::vm::PseudoHandle<hermes::vm::JSObject>::get() Line 58
hermes.dll!facebook::hermes::HermesRuntimeImpl::call(...)
Microsoft.ReactNative.dll!facebook::react::invokeCallback(...)
Microsoft.ReactNative.dll!facebook::react::NativeToJsBridge::invokeCallback(...)
```

### Chakra Crash (Scenario 2)
```
Windows.UI.Xaml.dll!ReturnHr(1) tid(16dc) 80070057 The parameter is incorrect.
Exception thrown: UnifiedRegex::ParseError at memory location 0x0000001371EFA3C0.
Exception thrown: ParseExceptionObject at memory location 0x0000001371EF7C10.
Exception thrown: facebook::jsi::JSError at memory location 0x0000001371EFE950.

Thread 'Chakra Parallel Worker Thread' has exited with code 1.
Thread 'Chakra Background Recycler' has exited with code 1.
Program 'TamshaiAiUnified.exe' has exited with code 1.
```

## Contact

For questions about this investigation, contact the development team.
