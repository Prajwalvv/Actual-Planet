import { EvidenceItem } from '../../adaptive-types';
import { buildEvidenceItem, ExtractorInput, TerrainAdapter } from '../terrain-adapter';

export class NewsAdapter implements TerrainAdapter {
  terrain: 'news' = 'news';

  extract(input: ExtractorInput): EvidenceItem[] {
    return [buildEvidenceItem(input, 'news', 0.08)];
  }
}
