import { EvidenceItem } from '../../adaptive-types';
import { buildEvidenceItem, ExtractorInput, TerrainAdapter } from '../terrain-adapter';

export class DocsAdapter implements TerrainAdapter {
  terrain: 'docs' = 'docs';

  extract(input: ExtractorInput): EvidenceItem[] {
    return [buildEvidenceItem(input, 'docs', 0.1)];
  }
}
