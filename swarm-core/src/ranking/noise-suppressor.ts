import { TopicAggregate } from '../adaptive-types';
import { isNoisyEntitySymbol } from '../resolver/noise-filter';

export function suppressNoisyTopics(topics: TopicAggregate[]): TopicAggregate[] {
  return topics.filter((topic) => !isNoisyEntitySymbol(topic.topic));
}
