import { AntBreedDefinition } from './types';
import { DocsReaderAnt } from './docs-reader-ant';
import { ForumThreadAnt } from './forum-thread-ant';
import { LinkPathfinderAnt } from './link-pathfinder-ant';
import { NewsReaderAnt } from './news-reader-ant';
import { PaperAbstractAnt } from './paper-abstract-ant';
import { SearchBootstrapAnt } from './search-bootstrap-ant';
import { SourceVerifierAnt } from './source-verifier-ant';

export class BreedRegistry {
  private breeds: AntBreedDefinition[];

  constructor() {
    this.breeds = [
      new SearchBootstrapAnt(),
      new LinkPathfinderAnt(),
      new NewsReaderAnt(),
      new ForumThreadAnt(),
      new DocsReaderAnt(),
      new PaperAbstractAnt(),
      new SourceVerifierAnt(),
    ];
  }

  getById(id: string): AntBreedDefinition | undefined {
    return this.breeds.find((breed) => breed.id === id);
  }

  list(): AntBreedDefinition[] {
    return [...this.breeds];
  }
}
