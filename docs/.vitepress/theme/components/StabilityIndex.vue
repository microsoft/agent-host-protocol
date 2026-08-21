<script setup lang="ts">
import { computed } from 'vue'

type StabilityLevel = '0' | '1' | '1.0' | '1.1' | '1.2' | '2' | '3'

const props = withDefaults(defineProps<{
  level: StabilityLevel
  compact?: boolean
}>(), {
  compact: false,
})

const levels = {
  '0': {
    label: 'Deprecated',
    description: 'Backward compatibility is not guaranteed, and the channel may be removed.',
  },
  '1': {
    label: 'Experimental',
    description: 'Backward-incompatible changes or removal may occur in any future release.',
  },
  '1.0': {
    label: 'Early development',
    description: 'The channel is unfinished and subject to substantial change.',
  },
  '1.1': {
    label: 'Active development',
    description: 'The channel is nearing minimum viability but may still change incompatibly.',
  },
  '1.2': {
    label: 'Release candidate',
    description: 'No further breaking changes are anticipated, but feedback may still require them.',
  },
  '2': {
    label: 'Stable',
    description: 'Compatibility is a high priority, and normal semantic-versioning guarantees apply.',
  },
  '3': {
    label: 'Legacy',
    description: 'The channel remains supported but is no longer actively developed.',
  },
} as const satisfies Record<StabilityLevel, { label: string; description: string }>

const stability = computed(() => levels[props.level])
const levelClass = computed(() => `stability-index--${props.level.replace('.', '-')}`)
const stabilityIndexHref = `${import.meta.env.BASE_URL}specification/versioning#stability-index`
</script>

<template>
  <aside
    class="stability-index"
    :class="[levelClass, { 'stability-index--compact': compact }]"
    :aria-label="`Stability ${level}: ${stability.label}`"
  >
    <div class="stability-index__heading">
      <span class="stability-index__level">Stability {{ level }}</span>
      <strong>{{ stability.label }}</strong>
    </div>
    <p v-if="!compact">{{ stability.description }}</p>
    <a
      v-if="!compact"
      :href="stabilityIndexHref"
    >
      About the stability index
    </a>
  </aside>
</template>
