// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "WindCore",
    platforms: [
        .iOS(.v15),
        .macOS(.v13),
    ],
    products: [
        .library(name: "WindCore", targets: ["WindCore"]),
    ],
    targets: [
        .target(name: "WindCore"),
        .testTarget(name: "WindCoreTests", dependencies: ["WindCore"]),
    ]
)
