import AppKit
import Foundation

let reporter = StatusEmitter()
do {
    let arguments = try HelperArguments.parse(Array(CommandLine.arguments.dropFirst()))
    reporter.emit(.starting)

    let application = NSApplication.shared
    application.setActivationPolicy(.accessory)
    let delegate = HelperApplicationDelegate(arguments: arguments, reporter: reporter)
    application.delegate = delegate
    application.run()
} catch {
    reporter.emit(.error, message: error.localizedDescription)
    exit(EX_USAGE)
}
