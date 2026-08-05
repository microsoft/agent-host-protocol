import Foundation
import XCTest
@testable import AgentHostProtocol

final class AutomationUnionTests: XCTestCase {
    func testScheduleEncodesUnionDiscriminator() throws {
        let schedule = AutomationSchedule.daily(AutomationDailySchedule(
            kind: .hourly,
            time: AutomationLocalTime(hour: 9, minute: 0),
            timeZone: "UTC"
        ))
        let data = try JSONEncoder().encode(schedule)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(object["kind"] as? String, "daily")
    }
}
