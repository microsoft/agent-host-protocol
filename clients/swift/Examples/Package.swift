// swift-tools-version: 6.0

import PackageDescription

// Runnable examples for the AgentHostProtocol Swift client.
//
// This is a separate local package so that the published package manifest at
// the repository root does not gain example targets. It depends on the root
// package by path.
//
// Run from the repository root:
//   swift run --package-path clients/swift/Examples WindowingBasic
//   swift run --package-path clients/swift/Examples WindowingBackpressure

let ahp: [Target.Dependency] = [
    .product(name: "AgentHostProtocol", package: "AgentHostProtocol"),
    .product(name: "AgentHostProtocolClient", package: "AgentHostProtocol"),
]

let package = Package(
    name: "AgentHostProtocolExamples",
    platforms: [
        .macOS(.v13),
    ],
    products: [
        .executable(name: "WindowingBasic", targets: ["WindowingBasic"]),
        .executable(name: "WindowingBackpressure", targets: ["WindowingBackpressure"]),
    ],
    dependencies: [
        .package(name: "AgentHostProtocol", path: "../../.."),
    ],
    targets: [
        .target(name: "WindowingDemoHost", dependencies: ahp),
        .executableTarget(name: "WindowingBasic", dependencies: ahp + ["WindowingDemoHost"]),
        .executableTarget(name: "WindowingBackpressure", dependencies: ahp + ["WindowingDemoHost"]),
    ]
)
