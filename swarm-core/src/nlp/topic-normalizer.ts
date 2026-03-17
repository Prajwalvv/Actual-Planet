import { canonicalizeEntity, normalizationVariants } from '../resolver/normalization';

export function normalizeTopic(raw: string): string {
  return canonicalizeEntity(raw);
}

export function topicVariants(raw: string): string[] {
  return normalizationVariants(raw);
}
