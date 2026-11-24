import Foundation
import CoreGraphics

/**
 * Pixie global typing signal helper.
 *
 * Emits one line on stdout for each key press in the current login session.
 * No key codes or text are reported to the app — only a `K` pulse — so the
 * pet can animate while the user types in any application.
 */

private let ignoredKeyCodes: Set<Int64> = [
  55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, // modifiers
  179, 180, 193, 314, 315, 316, 317 // media / power keys
]

private let callback: CGEventTapCallBack = { _, _, event, _ in
  let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
  if !ignoredKeyCodes.contains(keyCode) {
    fputs("K\n", stdout)
    fflush(stdout)
  }
  return Unmanaged.passUnretained(event)
}

guard let tap = CGEvent.tapCreate(
  tap: .cghidEventTap,
  place: .headInsertEventTap,
  options: .listenOnly,
  eventsOfInterest: CGEventMask(1 << CGEventType.keyDown.rawValue),
  callback: callback,
  userInfo: nil
) else {
  fputs("TAP_FAILED\n", stderr)
  fflush(stderr)
  exit(2)
}

fputs("READY\n", stdout)
fflush(stdout)

let runLoop = CFRunLoopGetCurrent()
if let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0) {
  CFRunLoopAddSource(runLoop, source, .commonModes)
}
CGEvent.tapEnable(tap: tap, enable: true)
CFRunLoopRun()
