import { EvidenceItem } from '../../adaptive-types';
import { buildEvidenceItem, ExtractorInput, TerrainAdapter } from '../terrain-adapter';

export class PaperAdapter implements TerrainAdapter {
  terrain: 'academic' = 'academic';

  extract(input: ExtractorInput): EvidenceItem[] {
    return [buildEvidenceItem(input, 'academic', 0.12)];
  }
}
