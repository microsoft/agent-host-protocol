package com.microsoft.agenthostprotocol

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject

@OptIn(ExperimentalSerializationApi::class)
internal abstract class UnknownMembersSerializer<T>(
    private val serializer: KSerializer<T>,
    private val extraOf: (T) -> Map<String, JsonElement>,
    private val withExtra: (T, Map<String, JsonElement>) -> T,
) : KSerializer<T> {
    override val descriptor: SerialDescriptor get() = serializer.descriptor
    private val knownKeys: Set<String> by lazy {
        (0 until descriptor.elementsCount).map(descriptor::getElementName).toSet()
    }

    override fun deserialize(decoder: Decoder): T {
        val input = decoder as? JsonDecoder ?: error("${descriptor.serialName} requires JSON")
        val obj = input.decodeJsonElement().jsonObject
        val value = input.json.decodeFromJsonElement(serializer, JsonObject(obj.filterKeys { it in knownKeys }))
        return withExtra(value, obj.filterKeys { it !in knownKeys })
    }

    override fun serialize(encoder: Encoder, value: T) {
        val output = encoder as? JsonEncoder ?: error("${descriptor.serialName} requires JSON")
        val known = output.json.encodeToJsonElement(serializer, value).jsonObject
        output.encodeJsonElement(JsonObject(extraOf(value).filterKeys { it !in knownKeys } + known))
    }
}
