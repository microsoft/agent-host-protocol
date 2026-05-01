import AgentHostProtocol
import SwiftUI

// MARK: - InputRequestView

/// Renders an active `SessionInputRequest`: message, optional URL, questions,
/// and Accept/Decline buttons. Drafts are synchronized via
/// `session/inputAnswerChanged` so every subscriber observes the same state.
struct InputRequestView: View {
    let request: SessionInputRequest
    @Environment(AppStore.self) private var store

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            if let message = request.message, !message.isEmpty {
                HStack(spacing: 8) {
                    Image(systemName: "questionmark.bubble")
                        .foregroundStyle(.blue)
                    Text(message)
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }

            // URL elicitation
            if let url = request.url, let link = URL(string: url) {
                Link(destination: link) {
                    Label(url, systemImage: "link")
                        .font(.caption)
                        .lineLimit(1)
                }
            }

            // Questions
            if let questions = request.questions, !questions.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(Array(questions.enumerated()), id: \.offset) { _, question in
                        QuestionView(
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

            // Actions
            HStack {
                Button("Decline", role: .destructive) {
                    Task {
                        await store.completeInputRequest(
                            requestId: request.id,
                            response: .decline
                        )
                    }
                }
                .buttonStyle(.bordered)
                .buttonBorderShape(.roundedRectangle(radius: 8))

                Spacer()

                Button("Accept") {
                    Task {
                        await store.completeInputRequest(
                            requestId: request.id,
                            response: .accept,
                            answers: submittedAnswers
                        )
                    }
                }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.roundedRectangle(radius: 8))
                .disabled(!canAccept)
            }
        }
        .padding(12)
        .background(Color.blue.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.blue.opacity(0.3), lineWidth: 1)
        )
    }

    // MARK: Helpers

    private func answer(for id: String) -> SessionInputAnswer? {
        request.answers?[id]
    }

    private var submittedAnswers: [String: SessionInputAnswer]? {
        // Promote any drafts to submitted on accept.
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

    /// Accept is allowed when every required question has an answer (draft,
    /// submitted, or skipped). The server will still validate.
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

// MARK: - QuestionView

private struct QuestionView: View {
    let question: SessionInputQuestion
    let answer: SessionInputAnswer?
    let onChange: (SessionInputAnswer?) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let title = questionTitle, !title.isEmpty {
                Text(title)
                    .font(.caption.weight(.semibold))
            }
            Text(questionMessage)
                .font(.caption)
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
        }
    }

    private var questionTitle: String? {
        switch question {
        case .text(let q): return q.title
        case .number(let q), .integer(let q): return q.title
        case .boolean(let q): return q.title
        case .singleSelect(let q): return q.title
        case .multiSelect(let q): return q.title
        }
    }

    private var questionMessage: String {
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
            .textFieldStyle(.roundedBorder)
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
            .textFieldStyle(.roundedBorder)
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
            Text(question.message).font(.caption)
        }
        .labelsHidden()
    }
}

private struct SingleSelectQuestionField: View {
    let question: SessionInputSingleSelectQuestion
    let answer: SessionInputAnswer?
    let onChange: (SessionInputAnswer?) -> Void

    private var selectedId: String? {
        if let a = answer, case .draft(let v) = a, case .selected(let sv) = v.value {
            return sv.value
        }
        if let a = answer, case .submitted(let v) = a, case .selected(let sv) = v.value {
            return sv.value
        }
        return nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(question.options, id: \.id) { option in
                Button {
                    let v = SessionInputAnswerValue.selected(
                        SessionInputSelectedAnswerValue(kind: .selected, value: option.id)
                    )
                    onChange(.draft(SessionInputAnswered(state: .draft, value: v)))
                } label: {
                    HStack {
                        Image(systemName: selectedId == option.id ? "largecircle.fill.circle" : "circle")
                            .foregroundStyle(selectedId == option.id ? Color.blue : Color.secondary)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(option.label).font(.caption)
                            if let desc = option.description {
                                Text(desc).font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                        Spacer()
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }
}

private struct MultiSelectQuestionField: View {
    let question: SessionInputMultiSelectQuestion
    let answer: SessionInputAnswer?
    let onChange: (SessionInputAnswer?) -> Void

    private var selectedIds: Set<String> {
        if let a = answer, case .draft(let v) = a, case .selectedMany(let sv) = v.value {
            return Set(sv.value)
        }
        if let a = answer, case .submitted(let v) = a, case .selectedMany(let sv) = v.value {
            return Set(sv.value)
        }
        return []
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(question.options, id: \.id) { option in
                Button {
                    var current = selectedIds
                    if current.contains(option.id) {
                        current.remove(option.id)
                    } else {
                        current.insert(option.id)
                    }
                    let v = SessionInputAnswerValue.selectedMany(
                        SessionInputSelectedManyAnswerValue(
                            kind: .selectedMany,
                            value: question.options.map(\.id).filter { current.contains($0) }
                        )
                    )
                    onChange(.draft(SessionInputAnswered(state: .draft, value: v)))
                } label: {
                    HStack {
                        Image(systemName: selectedIds.contains(option.id) ? "checkmark.square.fill" : "square")
                            .foregroundStyle(selectedIds.contains(option.id) ? Color.blue : Color.secondary)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(option.label).font(.caption)
                            if let desc = option.description {
                                Text(desc).font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                        Spacer()
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }
}
