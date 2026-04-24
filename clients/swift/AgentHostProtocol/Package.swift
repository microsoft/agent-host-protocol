// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "AgentHostProtocol",
    platforms: [
        .iOS(.v16),
        .macOS(.v13),
        .tvOS(.v16),
        .watchOS(.v9),
    ],
    products: [
        .library(
            name: "AgentHostProtocol",
            targets: ["AgentHostProtocol"]
        ),
    ],
    targets: [
        .target(
            name: "AgentHostProtocol",
            path: "Sources/AgentHostProtocol"
        ),
        .testTarget(
            name: "AgentHostProtocolTests",
            dependencies: ["AgentHostProtocol"],
            path: "Tests/AgentHostProtocolTests"
        ),
    ]
)
