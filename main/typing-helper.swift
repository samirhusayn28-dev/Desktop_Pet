import Foundation
import CoreGraphics

setbuf(stdout, nil)
setbuf(stderr, nil)

private let ignoredKeyCodes: Set<Int64> = [
  55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, // modifiers
  179, 180, 193, 314, 315, 316, 317 // media / power keys
]

private var globalTap: CFMachPort?

private let callback: CGEventTapCallBack = { _, type, event, _ in
  if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
    if let tap = globalTap { CGEvent.tapEnable(tap: tap, enable: true) }
    return Unmanaged.passUnretained(event)
  }
  guard type == .keyDown else { return Unmanaged.passUnretained(event) }
  let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
  if !ignoredKeyCodes.contains(keyCode) {
    fputs("K\n", stdout)
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
  exit(2)
}

globalTap = tap
let runLoop = CFRunLoopGetCurrent()
guard let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0) else {
  fputs("TAP_FAILED\n", stderr)
  exit(3)
}
CFRunLoopAddSource(runLoop, source, .commonModes)
CGEvent.tapEnable(tap: tap, enable: true)
fputs("READY\n", stdout)
CFRunLoopRun()
