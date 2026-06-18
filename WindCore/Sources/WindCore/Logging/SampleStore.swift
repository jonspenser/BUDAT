import Foundation
import SQLite3

public enum SampleStoreError: Error, Equatable {
    case sqlite(String)
    case invalidUTF8
}

public final class SampleStore: @unchecked Sendable {
    private let url: URL
    private var database: OpaquePointer?
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    public init(url: URL) throws {
        self.url = url
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
        try open()
        try migrate()
    }

    deinit {
        sqlite3_close(database)
    }

    public func insertSession(_ session: SessionRecord) throws {
        let sql = """
        INSERT OR REPLACE INTO sessions (
            id, started_at, ended_at, device_model, os_version, audio_route,
            sample_rate, buffer_size, sweep_bins_json, peak_heading_degrees,
            lobe_classification, lobe_sharpness, lobe_separation_degrees,
            lobe_confidence, capture_metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """
        try execute(sql) { statement in
            bind(statement, 1, session.id.uuidString)
            bind(statement, 2, session.startedAt.timeIntervalSince1970)
            bind(statement, 3, session.endedAt?.timeIntervalSince1970)
            bind(statement, 4, session.deviceModel)
            bind(statement, 5, session.osVersion)
            bind(statement, 6, session.audioRoute)
            bind(statement, 7, session.sampleRate)
            bind(statement, 8, session.bufferSize)
            bind(statement, 9, try self.json(session.sweepBins))
            bind(statement, 10, session.peakHeadingDegrees)
            bind(statement, 11, session.lobeClassification.rawValue)
            bind(statement, 12, session.lobeSharpness)
            bind(statement, 13, session.lobeSeparationDegrees)
            bind(statement, 14, session.lobeConfidence)
            bind(statement, 15, session.captureMetadataJSON)
        }
    }

    public func updateSessionEnd(id: UUID, endedAt: Date = Date()) throws {
        try execute("UPDATE sessions SET ended_at = ? WHERE id = ?;") { statement in
            bind(statement, 1, endedAt.timeIntervalSince1970)
            bind(statement, 2, id.uuidString)
        }
    }

    public func insertFeatureWindow(_ window: FeatureWindowRecord) throws {
        let sql = """
        INSERT OR REPLACE INTO feature_windows (
            id, session_id, captured_at, time_offset_seconds, heading_degrees,
            feature_json, feature_vector_json, quality_flags_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        """
        try execute(sql) { statement in
            bind(statement, 1, window.id.uuidString)
            bind(statement, 2, window.sessionID.uuidString)
            bind(statement, 3, window.capturedAt.timeIntervalSince1970)
            bind(statement, 4, window.timeOffsetSeconds)
            bind(statement, 5, window.headingDegrees)
            bind(statement, 6, window.featureJSON)
            bind(statement, 7, try self.json(window.featureVector))
            bind(statement, 8, try self.json(window.qualityFlags))
        }
    }

    public func insertFeatureWindow<Feature>(sessionID: UUID, feature: Feature, capturedAt: Date = Date()) throws {
        let record = FeatureWindowRecord(
            sessionID: sessionID,
            capturedAt: capturedAt,
            timeOffsetSeconds: FeatureReflection.optionalDouble(named: ["timeOffsetSeconds", "timeOffset"], in: feature) ?? 0,
            headingDegrees: FeatureReflection.optionalDouble(named: ["headingDegrees", "heading"], in: feature),
            featureJSON: try FeatureReflection.jsonString(from: feature),
            featureVector: FeatureReflection.numericVector(from: feature),
            qualityFlags: FeatureReflection.stringFlags(from: feature)
        )
        try insertFeatureWindow(record)
    }

    public func insertCorrection(_ correction: CorrectionRecord) throws {
        let sql = """
        INSERT OR REPLACE INTO corrections (
            id, session_id, entered_speed, unit, speed_mps, reading_type,
            observation_started_at, observation_ended_at, anemometer_type,
            prediction_json, summary_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """
        try execute(sql) { statement in
            bind(statement, 1, correction.id.uuidString)
            bind(statement, 2, correction.sessionID.uuidString)
            bind(statement, 3, correction.enteredSpeed)
            bind(statement, 4, correction.unit.rawValue)
            bind(statement, 5, correction.speedMetersPerSecond)
            bind(statement, 6, correction.readingType.rawValue)
            bind(statement, 7, correction.observationStartedAt.timeIntervalSince1970)
            bind(statement, 8, correction.observationEndedAt.timeIntervalSince1970)
            bind(statement, 9, correction.anemometerType)
            bind(statement, 10, try self.json(correction.predictionShown))
            bind(statement, 11, try self.json(correction.summary))
            bind(statement, 12, correction.createdAt.timeIntervalSince1970)
        }
    }

    public func sessions() throws -> [SessionRecord] {
        try query("SELECT * FROM sessions ORDER BY started_at ASC;") { statement in
            try readSession(statement)
        }
    }

    public func featureWindows(sessionID: UUID? = nil) throws -> [FeatureWindowRecord] {
        if let sessionID {
            return try query(
                "SELECT * FROM feature_windows WHERE session_id = ? ORDER BY captured_at ASC;",
                bind: { bind($0, 1, sessionID.uuidString) },
                read: readFeatureWindow
            )
        }
        return try query("SELECT * FROM feature_windows ORDER BY captured_at ASC;", read: readFeatureWindow)
    }

    public func corrections(sessionID: UUID? = nil) throws -> [CorrectionRecord] {
        if let sessionID {
            return try query(
                "SELECT * FROM corrections WHERE session_id = ? ORDER BY created_at ASC;",
                bind: { bind($0, 1, sessionID.uuidString) },
                read: readCorrection
            )
        }
        return try query("SELECT * FROM corrections ORDER BY created_at ASC;", read: readCorrection)
    }

    public func exportSamples(to destinationURL: URL) throws {
        let export = SampleExport(
            sessions: try sessions(),
            featureWindows: try featureWindows(),
            corrections: try corrections()
        )
        let data = try encoder.encode(export)
        try data.write(to: destinationURL, options: .atomic)
    }

    public func exportJSONLines(to destinationURL: URL) throws {
        var lines: [String] = []
        for session in try sessions() {
            lines.append(try jsonLine(type: "session", record: session))
        }
        for window in try featureWindows() {
            lines.append(try jsonLine(type: "feature_window", record: window))
        }
        for correction in try corrections() {
            lines.append(try jsonLine(type: "correction", record: correction))
        }
        guard let data = lines.joined(separator: "\n").data(using: .utf8) else {
            throw SampleStoreError.invalidUTF8
        }
        try data.write(to: destinationURL, options: .atomic)
    }

    private func open() throws {
        let parent = url.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: true)
        guard sqlite3_open(url.path, &database) == SQLITE_OK else {
            throw SampleStoreError.sqlite(lastError)
        }
        sqlite3_exec(database, "PRAGMA foreign_keys = ON;", nil, nil, nil)
        sqlite3_exec(database, "PRAGMA journal_mode = WAL;", nil, nil, nil)
    }

    private func migrate() throws {
        try execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            started_at REAL NOT NULL,
            ended_at REAL,
            device_model TEXT NOT NULL,
            os_version TEXT NOT NULL,
            audio_route TEXT NOT NULL,
            sample_rate REAL NOT NULL,
            buffer_size INTEGER NOT NULL,
            sweep_bins_json TEXT NOT NULL,
            peak_heading_degrees REAL,
            lobe_classification TEXT NOT NULL,
            lobe_sharpness REAL,
            lobe_separation_degrees REAL,
            lobe_confidence REAL,
            capture_metadata_json TEXT NOT NULL
        );
        """)
        try execute("""
        CREATE TABLE IF NOT EXISTS feature_windows (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            captured_at REAL NOT NULL,
            time_offset_seconds REAL NOT NULL,
            heading_degrees REAL,
            feature_json TEXT NOT NULL,
            feature_vector_json TEXT NOT NULL,
            quality_flags_json TEXT NOT NULL
        );
        """)
        try execute("""
        CREATE TABLE IF NOT EXISTS corrections (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            entered_speed REAL NOT NULL,
            unit TEXT NOT NULL,
            speed_mps REAL NOT NULL,
            reading_type TEXT NOT NULL,
            observation_started_at REAL NOT NULL,
            observation_ended_at REAL NOT NULL,
            anemometer_type TEXT NOT NULL,
            prediction_json TEXT NOT NULL,
            summary_json TEXT NOT NULL,
            created_at REAL NOT NULL
        );
        """)
    }

    private func execute(_ sql: String, bind: ((OpaquePointer) throws -> Void)? = nil) throws {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK else {
            throw SampleStoreError.sqlite(lastError)
        }
        defer { sqlite3_finalize(statement) }
        if let statement {
            try bind?(statement)
        }
        guard sqlite3_step(statement) == SQLITE_DONE else {
            throw SampleStoreError.sqlite(lastError)
        }
    }

    private func query<T>(
        _ sql: String,
        bind: ((OpaquePointer) throws -> Void)? = nil,
        read: (OpaquePointer) throws -> T
    ) throws -> [T] {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK else {
            throw SampleStoreError.sqlite(lastError)
        }
        defer { sqlite3_finalize(statement) }
        if let statement {
            try bind?(statement)
        }
        var rows: [T] = []
        while sqlite3_step(statement) == SQLITE_ROW {
            guard let statement else { continue }
            rows.append(try read(statement))
        }
        return rows
    }

    private func readSession(_ statement: OpaquePointer) throws -> SessionRecord {
        SessionRecord(
            id: UUID(uuidString: columnText(statement, 0)) ?? UUID(),
            startedAt: Date(timeIntervalSince1970: columnDouble(statement, 1)),
            endedAt: columnOptionalDouble(statement, 2).map(Date.init(timeIntervalSince1970:)),
            deviceModel: columnText(statement, 3),
            osVersion: columnText(statement, 4),
            audioRoute: columnText(statement, 5),
            sampleRate: columnDouble(statement, 6),
            bufferSize: columnInt(statement, 7),
            sweepBins: try decode([SweepBinRecord].self, from: columnText(statement, 8)),
            peakHeadingDegrees: columnOptionalDouble(statement, 9),
            lobeClassification: LobeClassification(rawValue: columnText(statement, 10)) ?? .unknown,
            lobeSharpness: columnOptionalDouble(statement, 11),
            lobeSeparationDegrees: columnOptionalDouble(statement, 12),
            lobeConfidence: columnOptionalDouble(statement, 13),
            captureMetadataJSON: columnText(statement, 14)
        )
    }

    private func readFeatureWindow(_ statement: OpaquePointer) throws -> FeatureWindowRecord {
        FeatureWindowRecord(
            id: UUID(uuidString: columnText(statement, 0)) ?? UUID(),
            sessionID: UUID(uuidString: columnText(statement, 1)) ?? UUID(),
            capturedAt: Date(timeIntervalSince1970: columnDouble(statement, 2)),
            timeOffsetSeconds: columnDouble(statement, 3),
            headingDegrees: columnOptionalDouble(statement, 4),
            featureJSON: columnText(statement, 5),
            featureVector: try decode([String: Double].self, from: columnText(statement, 6)),
            qualityFlags: try decode([String].self, from: columnText(statement, 7))
        )
    }

    private func readCorrection(_ statement: OpaquePointer) throws -> CorrectionRecord {
        CorrectionRecord(
            id: UUID(uuidString: columnText(statement, 0)) ?? UUID(),
            sessionID: UUID(uuidString: columnText(statement, 1)) ?? UUID(),
            enteredSpeed: columnDouble(statement, 2),
            unit: WindSpeedUnit(rawValue: columnText(statement, 3)) ?? .metersPerSecond,
            readingType: WindReadingType(rawValue: columnText(statement, 5)) ?? .average,
            observationStartedAt: Date(timeIntervalSince1970: columnDouble(statement, 6)),
            observationEndedAt: Date(timeIntervalSince1970: columnDouble(statement, 7)),
            anemometerType: columnText(statement, 8),
            predictionShown: try decode(PredictionSnapshot?.self, from: columnText(statement, 9)),
            summary: try decode(CorrectionSummary.self, from: columnText(statement, 10)),
            createdAt: Date(timeIntervalSince1970: columnDouble(statement, 11))
        )
    }

    private func json<T: Encodable>(_ value: T) throws -> String {
        let data = try encoder.encode(value)
        guard let string = String(data: data, encoding: .utf8) else { throw SampleStoreError.invalidUTF8 }
        return string
    }

    private func jsonObject<T: Encodable>(_ value: T) throws -> Any {
        try JSONSerialization.jsonObject(with: encoder.encode(value))
    }

    private func jsonLine<T: Encodable>(type: String, record: T) throws -> String {
        let object: [String: Any] = ["type": type, "record": try jsonObject(record)]
        let data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
        guard let string = String(data: data, encoding: .utf8) else { throw SampleStoreError.invalidUTF8 }
        return string
    }

    private func decode<T: Decodable>(_ type: T.Type, from string: String) throws -> T {
        try decoder.decode(type, from: Data(string.utf8))
    }

    private var lastError: String {
        if let database, let message = sqlite3_errmsg(database) {
            return String(cString: message)
        }
        return "Unknown SQLite error"
    }
}

private func bind(_ statement: OpaquePointer, _ index: Int32, _ value: String) {
    sqlite3_bind_text(statement, index, value, -1, SQLITE_TRANSIENT)
}

private func bind(_ statement: OpaquePointer, _ index: Int32, _ value: Double) {
    sqlite3_bind_double(statement, index, value)
}

private func bind(_ statement: OpaquePointer, _ index: Int32, _ value: Double?) {
    if let value {
        sqlite3_bind_double(statement, index, value)
    } else {
        sqlite3_bind_null(statement, index)
    }
}

private func bind(_ statement: OpaquePointer, _ index: Int32, _ value: Int) {
    sqlite3_bind_int64(statement, index, sqlite3_int64(value))
}

private func columnText(_ statement: OpaquePointer, _ index: Int32) -> String {
    guard let text = sqlite3_column_text(statement, index) else { return "" }
    return String(cString: text)
}

private func columnDouble(_ statement: OpaquePointer, _ index: Int32) -> Double {
    sqlite3_column_double(statement, index)
}

private func columnOptionalDouble(_ statement: OpaquePointer, _ index: Int32) -> Double? {
    sqlite3_column_type(statement, index) == SQLITE_NULL ? nil : sqlite3_column_double(statement, index)
}

private func columnInt(_ statement: OpaquePointer, _ index: Int32) -> Int {
    Int(sqlite3_column_int64(statement, index))
}

private let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
