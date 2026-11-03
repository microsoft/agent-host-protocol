package com.microsoft.agenthostprotocol

import com.microsoft.agenthostprotocol.generated.CreateChatParams
import com.microsoft.agenthostprotocol.generated.Message
import com.microsoft.agenthostprotocol.generated.MessageKind
import com.microsoft.agenthostprotocol.generated.MessageOrigin
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ConstructorCompatibilityTest {
    @Test
    fun `old full positional CreateChatParams constructor retains its source semantics`() {
        val message = Message("Hello", MessageOrigin(MessageKind.USER))
        val createChat =
            CreateChatParams(
                "ahp-session:/session",
                null,
                "ahp-chat:/chat",
                message,
                null,
                listOf("file:///workspace"),
            )

        assertEquals(message, createChat.initialMessage)
        assertEquals(listOf("file:///workspace"), createChat.workingDirectories)
        assertNull(createChat.title)
    }
}
