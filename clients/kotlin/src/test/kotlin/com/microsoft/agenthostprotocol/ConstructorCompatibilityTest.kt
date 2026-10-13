package com.microsoft.agenthostprotocol

import com.microsoft.agenthostprotocol.generated.CreateChatParams
import com.microsoft.agenthostprotocol.generated.Message
import com.microsoft.agenthostprotocol.generated.MessageKind
import com.microsoft.agenthostprotocol.generated.MessageOrigin
import com.microsoft.agenthostprotocol.generated.MultipleChatsCapability
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ConstructorCompatibilityTest {
    @Test
    fun `old full positional constructors retain their source semantics`() {
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
        val multipleChats = MultipleChatsCapability(true, true)

        assertEquals(message, createChat.initialMessage)
        assertEquals(listOf("file:///workspace"), createChat.workingDirectories)
        assertNull(createChat.title)
        assertTrue(multipleChats.fork == true)
        assertTrue(multipleChats.sideChat == true)
        assertNull(multipleChats.initialTitle)
        assertNull(multipleChats.forkWithInitialMessage)
    }
}
