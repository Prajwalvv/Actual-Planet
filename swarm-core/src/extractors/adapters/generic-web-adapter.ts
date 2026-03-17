import { EvidenceItem } from '../../adaptive-types';
import { buildEvidenceItem, ExtractorInput, TerrainAdapter } from '../terrain-adapter';

export class GenericWebAdapter implements TerrainAdapter {
  terrain: 'generic-web' = 'generic-web';

  extract(input: ExtractorInput): EvidenceItem[] {
    return [buildEvidenceItem(input, input.terrain || 'general-web', 0)];
  }
}
