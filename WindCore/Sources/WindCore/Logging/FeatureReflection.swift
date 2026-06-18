import Foundation

public enum FeatureReflection {
    public static func jsonString(from value: Any) throws -> String {
        let object = reflectedObject(value)
        let data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
        return String(data: data, encoding: .utf8) ?? "{}"
    }

    public static func numericVector(from value: Any) -> [String: Double] {
        var output: [String: Double] = [:]
        collectNumbers(value, prefix: "", into: &output)
        return output
    }

    public static func stringFlags(from value: Any) -> [String] {
        var flags: [String] = []
        collectFlags(value, prefix: "", into: &flags)
        return Array(Set(flags)).sorted()
    }

    public static func optionalDouble(named names: [String], in value: Any) -> Double? {
        let vector = numericVector(from: value)
        for name in names {
            if let exact = vector[name] {
                return exact
            }
            if let suffix = vector.first(where: { $0.key.lowercased().hasSuffix(name.lowercased()) })?.value {
                return suffix
            }
        }
        return nil
    }

    private static func reflectedObject(_ value: Any) -> Any {
        switch unwrapOptional(value) {
        case nil:
            return NSNull()
        case let string as String:
            return string
        case let bool as Bool:
            return bool
        case let int as Int:
            return int
        case let double as Double:
            return finiteJSONNumber(double)
        case let float as Float:
            return finiteJSONNumber(Double(float))
        case let date as Date:
            return ISO8601DateFormatter().string(from: date)
        case let uuid as UUID:
            return uuid.uuidString
        case let array as [Any]:
            return array.map(reflectedObject)
        case let dictionary as [String: Any]:
            return dictionary.mapValues(reflectedObject)
        case let value?:
            let mirror = Mirror(reflecting: value)
            if mirror.displayStyle == .enum {
                return String(describing: value)
            }
            if mirror.children.isEmpty {
                return String(describing: value)
            }
            var object: [String: Any] = [:]
            for child in mirror.children {
                guard let label = child.label else { continue }
                object[label] = reflectedObject(child.value)
            }
            return object
        }
    }

    private static func collectNumbers(_ value: Any, prefix: String, into output: inout [String: Double]) {
        guard let unwrapped = unwrapOptional(value) else { return }
        switch unwrapped {
        case let double as Double:
            if double.isFinite, !prefix.isEmpty {
                output[prefix] = double
            }
        case let float as Float:
            let double = Double(float)
            if double.isFinite, !prefix.isEmpty {
                output[prefix] = double
            }
        case let int as Int:
            if !prefix.isEmpty {
                output[prefix] = Double(int)
            }
        case let bool as Bool:
            if !prefix.isEmpty {
                output[prefix] = bool ? 1 : 0
            }
        default:
            let mirror = Mirror(reflecting: unwrapped)
            for child in mirror.children {
                guard let label = child.label else { continue }
                let childPrefix = prefix.isEmpty ? label : "\(prefix).\(label)"
                collectNumbers(child.value, prefix: childPrefix, into: &output)
            }
        }
    }

    private static func collectFlags(_ value: Any, prefix: String, into flags: inout [String]) {
        guard let unwrapped = unwrapOptional(value) else { return }
        if let bool = unwrapped as? Bool, bool, !prefix.isEmpty {
            flags.append(prefix)
            return
        }
        let mirror = Mirror(reflecting: unwrapped)
        if mirror.displayStyle == .enum, !prefix.isEmpty {
            let description = String(describing: unwrapped)
            if description != "none" && description != "false" {
                flags.append("\(prefix):\(description)")
            }
            return
        }
        for child in mirror.children {
            guard let label = child.label else { continue }
            let childPrefix = prefix.isEmpty ? label : "\(prefix).\(label)"
            collectFlags(child.value, prefix: childPrefix, into: &flags)
        }
    }

    private static func unwrapOptional(_ value: Any) -> Any? {
        let mirror = Mirror(reflecting: value)
        guard mirror.displayStyle == .optional else { return value }
        return mirror.children.first?.value
    }

    private static func finiteJSONNumber(_ value: Double) -> Any {
        value.isFinite ? value : NSNull()
    }
}
