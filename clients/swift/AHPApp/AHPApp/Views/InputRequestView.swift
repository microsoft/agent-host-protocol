import AgentHostProtocol
import SwiftUI

// MARK: - InputRequestPrompt

/// Compact prompt card shown above the input bar when the agent is requesting
/// input. Tapping it presents the full form in a modal sheet.
struct InputRequestPrompt: View {
    let request: SessionInputRequest
    let onTap: () -> Void

    private var primaryText: String {
        if let message = request.message, !message.isEmpty { return message }
        return "Agent is requesting input"
    }

    private var secondaryText: String? {
        guard let questions = request.questions, !questions.isEmpty else { return nil }
        let count = questions.count
        return count == 1 ? "1 question" : "\(count) questions"
    }

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                Image(systemName: "questionmark.bubble.fill")
                    .font(.title3)
                    .foregroundStyle(Color.blue)

                VStack(alignment: .leading, spacing: 2) {
                    Text(primaryText)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    if let secondary = secondaryText {
                        Text(secondary)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Spacer(minLength: 8)

                Text("Respond")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Color.blue, in: Capsule())
            }
            .padding(12)
            .background(Color.blue.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.blue.opacity(0.3), lineWidth: 1)
            )
            .contentShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - InputRequestSheet

/// Modal sheet that renders the input request as a native iOS form with
/// toolbar Cancel/Submit actions. Auto-dismissal on resolution is handled
/// by the presenter.
struct InputRequestSheet: View {
    let request: SessionInputRequest
    let onDismiss: () -> Void
    @Environment(AppStore.self) private var store

    var body: some View {
        NavigationStack {
            Form {
                if let message = request.message, !message.isEmpty {
                    Section {
                        Text(message)
                            .font(.body)
                    }
                }

                if let url = request.url, let link = URL(string: url) {
                    Section {
                        Link(destination: link) {
                            Label(url, systemImage: "link")
                                .lineLimit(1)
                        }
                    }
                }

                if let questions = request.questions {
                    ForEach(Array(questions.enumerated()), id: \.offset) { _, question in
                        QuestionSection(
                            question: question,
                            answer: answer(for: questionId(of: question)),
                            onChange: { newAnswer in
                                Task {
                                    await store.setInputAnswer(
                                        requestId: request.id,
                                        questionId: questionId(of: question),
                                        answer: newAnswer
                                    )
                                }
                            }
                        )
                    }
                }
            }
            .navigationTitle("Agent Request")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Decline", role: .destructive) {
                        Task {
                            await store.completeInputRequest(
                                requestId: request.id,
                                response: .decline
                            )
                            onDismiss()
                        }
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Submit") {
                        Task {
                            await store.completeInputRequest(
                                requestId: request.id,
                                response: .accept,
                                answers: submittedAnswers
                            )
                            onDismiss()
                        }
                    }
                    .disabled(!canAccept)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    // MARK: Helpers

    private func answer(for id: String) -> SessionInputAnswer? {
        request.answers?[id]
    }

    private var submittedAnswers: [String: SessionInputAnswer]? {
        guard let current = request.answers else { return nil }
        var result: [String: SessionInputAnswer] = [:]
        for (id, a) in current {
            switch a {
            case .draft(let v):
                result[id] = .submitted(SessionInputAnswered(state: .submitted, value: v.value))
            case .submitted, .skipped:
                result[id] = a
            }
        }
        return result
    }

    private var canAccept: Bool {
        guard let questions = request.questions else { return true }
        for q in questions {
            if isRequired(q) && answer(for: questionId(of: q)) == nil {
                return false
            }
        }
        return true
    }

    private func questionId(of question: SessionInputQuestion) -> String {
        switch question {
        case .text(let q): return q.id
        case .number(let q), .integer(let q): return q.id
        case .boolean(let q): return q.id
        case .singleSelect(let q): return q.id
        case .multiSelect(let q): return q.id
        }
    }

    private func isRequired(_ question: SessionInputQuestion) -> Bool {
        switch question {
        case .text(let q): return q.required ?? false
        case .number(let q), .integer(let q): return q.required ?? false
        case .boolean(let q): return q.required ?? false
        case .singleSelect(let q): return q.required ?? false
        case .multiSelect(let q): return q.required ?? false
        }
    }
}

// MARK: - QuestionSection

/// Native `Form`-style rendering of a single question as a `Section`.
private struct QuestionSection: View {
    let question: SessionInputQuestion
    let answer: SessionInputAnswer?
    let onChange: (SessionInputAnswer?) -> Void

    var body: some View {
        Section {
            // Show the question message first so the user reads it before
            // seeing the options — previously this was in the footer which
            // placed it after the controls.
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)

            switch question {
            case .text(let q):
                TextQuestionField(question: q, answer: answer, onChange: onChange)
            case .number(let q), .integer(let q):
                NumberQuestionField(question: q, answer: answer, onChange: onChange)
            case .boolean(let q):
                BooleanQuestionField(question: q, answer: answer, onChange: onChange)
            case .singleSelect(let q):
                SingleSelectQuestionField(question: q, answer: answer, onChange: onChange)
            case .multiSelect(let q):
                MultiSelectQuestionField(question: q, answer: answer, onChange: onChange)
            }
        } header: {
            if let title = title, !title.isEmpty {
                Text(title)
            }
        }
    }

    private var title: String? {
        switch question {
        case .text(let q): return q.title
        case .number(let q), .integer(let q): return q.title
        case .boolean(let q): return q.title
        case .singleSelect(let q): return q.title
        case .multiSelect(let q): return q.title
        }
    }

    private var message: String {
        switch question {
        case .text(let q): return q.message
        case .number(let q), .integer(let q): return q.message
        case .boolean(let q): return q.message
        case .singleSelect(let q): return q.message
        case .multiSelect(let q): return q.message
        }
    }
}

// MARK: - Field Views

private struct TextQuestionField: View {
    let question: SessionInputTextQuestion
    let answer: SessionInputAnswer?
    let onChange: (SessionInputAnswer?) -> Void
    @State private var text: String = ""

    var body: some View {
        TextField("Type your answer…", text: $text, axis: .vertical)
            .lineLimit(1...5)
            .onAppear {
                if let a = answer, case .draft(let v) = a, case .text(let tv) = v.value {
                    text = tv.value
                } else if let a = answer, case .submitted(let v) = a, case .text(let tv) = v.value {
                    text = tv.value
                } else {
                    text = question.defaultValue ?? ""
                }
            }
            .onChange(of: text) { _, newValue in
                let value = SessionInputAnswerValue.text(
                    SessionInputTextAnswerValue(kind: .text, value: newValue)
                )
                onChange(.draft(SessionInputAnswered(state: .draft, value: value)))
            }
    }
}

private struct NumberQuestionField: View {
    let question: SessionInputNumberQuestion
    let answer: SessionInputAnswer?
    let onChange: (SessionInputAnswer?) -> Void
    @State private var text: String = ""

    var body: some View {
        TextField("Number", text: $text)
            .keyboardType(.decimalPad)
            .onAppear {
                if let a = answer, case .draft(let v) = a, case .number(let nv) = v.value {
                    text = formatted(nv.value)
                } else if let d = question.defaultValue {
                    text = formatted(d)
                }
            }
            .onChange(of: text) { _, newValue in
                guard let n = Double(newValue) else {
                    onChange(nil)
                    return
                }
                let value = SessionInputAnswerValue.number(
                    SessionInputNumberAnswerValue(kind: .number, value: n)
                )
                onChange(.draft(SessionInputAnswered(state: .draft, value: value)))
            }
    }

    private func formatted(_ d: Double) -> String {
        if d.truncatingRemainder(dividingBy: 1) == 0 {
            return String(Int(d))
        }
        return String(d)
    }
}

private struct BooleanQuestionField: View {
    let question: SessionInputBooleanQuestion
    let answer: SessionInputAnswer?
    let onChange: (SessionInputAnswer?) -> Void

    private var value: Bool {
        if let a = answer, case .draft(let v) = a, case .boolean(let bv) = v.value {
            return bv.value
        }
        if let a = answer, case .submitted(let v) = a, case .boolean(let bv) = v.value {
            return bv.value
        }
        return question.defaultValue ?? false
    }

    var body: some View {
        Toggle(isOn: Binding(
            get: { value },
            set: { newValue in
                let v = SessionInputAnswerValue.boolean(
                    SessionInputBooleanAnswerValue(kind: .boolean, value: newValue)
                )
                onChange(.draft(SessionInputAnswered(state: .draft, value: v)))
            }
        )) {
            Text(question.title ?? "Yes")
        }
    }
}

private struct SingleSelectQuestionField: View {
    let question: SessionInputSingleSelectQuestion
    let answer: SessionInputAnswer?
    let onChange: (SessionInputAnswer?) -> Void

    @State private var freeformText: String = ""
    @FocusState private var freeformFocused: Bool

    private var allowsFreeform: Bool { question.allowFreeformInput ?? false }

    private var currentValue: SessionInputSelectedAnswerValue? {
        guard let answer else { return nil }
        switch answer {
        case .draft(let v), .submitted(let v):
            if case .selected(let sv) = v.value { return sv }
            return nil
        case .skipped: return nil
        }
    }

    private var selectedId: String? {
        guard let v = currentValue else { return nil }
        // Treat empty-string value as "freeform mode".
        return v.value.isEmpty ? nil : v.value
    }

    private var isFreeformActive: Bool {
        guard let v = currentValue else { return false }
        return v.value.isEmpty && !(v.freeformValues?.isEmpty ?? true)
    }

    var body: some View {
        ForEach(question.options, id: \.id) { option in
            Button {
                let v = SessionInputAnswerValue.selected(
                    SessionInputSelectedAnswerValue(kind: .selected, value: option.id)
                )
                onChange(.draft(SessionInputAnswered(state: .draft, value: v)))
                freeformText = ""
                freeformFocused = false
            } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(option.label)
                            .foregroundStyle(.primary)
                        if let desc = option.description {
                            Text(desc)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    Spacer()
                    if selectedId == option.id {
                        Image(systemName: "checkmark")
                            .foregroundStyle(Color.accentColor)
                            .fontWeight(.semibold)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }

        if allowsFreeform {
            HStack(spacing: 8) {
                Text("Other")
                    .foregroundStyle(.secondary)
                TextField("Type your answer\u{2026}", text: $freeformText, axis: .vertical)
                    .lineLimit(1...4)
                    .focused($freeformFocused)
                    .multilineTextAlignment(.trailing)
                if isFreeformActive {
                    Image(systemName: "checkmark")
                        .foregroundStyle(Color.accentColor)
                        .fontWeight(.semibold)
                }
            }
            .onAppear {
                if let v = currentValue, v.value.isEmpty,
                   let first = v.freeformValues?.first {
                    freeformText = first
                }
            }
            .onChange(of: freeformText) { _, newValue in
                let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
                if trimmed.isEmpty {
                    // Clear freeform-only answers; keep selected-option answers.
                    if isFreeformActive {
                        onChange(nil)
                    }
                } else {
                    let v = SessionInputAnswerValue.selected(
                        SessionInputSelectedAnswerValue(
                            kind: .selected,
                            value: "",
                            freeformValues: [newValue]
                        )
                    )
                    onChange(.draft(SessionInputAnswered(state: .draft, value: v)))
                }
            }
        }
    }
}

private struct MultiSelectQuestionField: View {
    let question: SessionInputMultiSelectQuestion
    let answer: SessionInputAnswer?
    let onChange: (SessionInputAnswer?) -> Void

    @State private var freeformText: String = ""

    private var allowsFreeform: Bool { question.allowFreeformInput ?? false }

    private var currentValue: SessionInputSelectedManyAnswerValue? {
        guard let answer else { return nil }
        switch answer {
        case .draft(let v), .submitted(let v):
            if case .selectedMany(let sv) = v.value { return sv }
            return nil
        case .skipped: return nil
        }
    }

    private var selectedIds: Set<String> {
        Set(currentValue?.value ?? [])
    }

    var body: some View {
        ForEach(question.options, id: \.id) { option in
            Button {
                toggle(option.id)
            } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(option.label)
                            .foregroundStyle(.primary)
                        if let desc = option.description {
                            Text(desc)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    Spacer()
                    if selectedIds.contains(option.id) {
                        Image(systemName: "checkmark")
                            .foregroundStyle(Color.accentColor)
                            .fontWeight(.semibold)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }

        if allowsFreeform {
            TextField("Add your own (one per line)\u{2026}", text: $freeformText, axis: .vertical)
                .lineLimit(1...4)
                .onAppear {
                    if let values = currentValue?.freeformValues, !values.isEmpty {
                        freeformText = values.joined(separator: "\n")
                    }
                }
                .onChange(of: freeformText) { _, newValue in
                    emitChange(selected: Array(selectedIds), freeform: parseFreeform(newValue))
                }
        }
    }

    private func toggle(_ id: String) {
        var current = selectedIds
        if current.contains(id) { current.remove(id) } else { current.insert(id) }
        let ordered = question.options.map(\.id).filter { current.contains($0) }
        emitChange(selected: ordered, freeform: parseFreeform(freeformText))
    }

    private func parseFreeform(_ text: String) -> [String] {
        text.split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
    }

    private func emitChange(selected: [String], freeform: [String]) {
        if selected.isEmpty && freeform.isEmpty {
            onChange(nil)
            return
        }
        let v = SessionInputAnswerValue.selectedMany(
            SessionInputSelectedManyAnswerValue(
                kind: .selectedMany,
                value: selected,
                freeformValues: freeform.isEmpty ? nil : freeform
            )
        )
        onChange(.draft(SessionInputAnswered(state: .draft, value: v)))
    }
}
